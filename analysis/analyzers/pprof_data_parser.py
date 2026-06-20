"""
pprof CPU 数据解析器

解析 go tool pprof 输出的 CPU profile 数据。
支持两种格式：
1. 文本格式 (go tool pprof -text)
2. CSV 格式 (go tool pprof -csv)

输出统一为 {function: flat_samples} 字典。
"""
import csv
import re
from io import StringIO


def parse_pprof_text(text: str) -> dict[str, float]:
    """
    解析 pprof -text 输出格式。

    示例输入:
        flat  flat%   sum%        cum   cum%
        1.23s 45.6% 45.6%     2.34s 85.7%  runtime.mallocgc
        0.56s 20.7% 66.3%     0.56s 20.7%  runtime.slicebytetostring

    返回: {"runtime.mallocgc": 1.23, "runtime.slicebytetostring": 0.56}
    """
    samples = {}
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("flat") or line.startswith("-"):
            continue

        # 完整格式: flat_time flat% sum% cum_time cum% function.
        # go tool pprof may print zero values without units, e.g.
        # "0 0% 87.47% 0.12s 0.92% runtime.gcBgMarkWorker".
        match = re.match(
            r'^([\d.]+)(ms|s|us|m|h)?\s+[\d.]+%\s+[\d.]+%\s+([\d.]+)(ms|s|us|m|h)?\s+[\d.]+%\s+(.+)$',
            line
        )
        if match:
            value = float(match.group(1))
            unit = match.group(2) or "s"
            cum_unit = match.group(4)
            func = match.group(5).strip()
            if not match.group(2) and value != 0:
                raise ValueError(f"missing flat time unit in line: {line!r}")
            if not cum_unit and float(match.group(3)) != 0:
                raise ValueError(f"missing cumulative time unit in line: {line!r}")
            samples[func] = _to_seconds(value, unit)
            continue

        # 简化格式1: flat_time flat% sum% function (无 cum 列，有 sum%)
        match_simple1 = re.match(
            r'^([\d.]+)(ms|s|us|m|h)\s+[\d.]+%\s+[\d.]+%\s+(.+)$',
            line
        )
        if match_simple1:
            value = float(match_simple1.group(1))
            unit = match_simple1.group(2)
            func = match_simple1.group(3).strip()
            samples[func] = _to_seconds(value, unit)
            continue

        # 简化格式2: flat_time flat% function (无 cum 列，无 sum%)
        match_simple2 = re.match(
            r'^([\d.]+)(ms|s|us|m|h)\s+[\d.]+%\s+(.+)$',
            line
        )
        if match_simple2:
            value = float(match_simple2.group(1))
            unit = match_simple2.group(2)
            func = match_simple2.group(3).strip()
            samples[func] = _to_seconds(value, unit)
            continue

        # 检测格式异常：以数字开头但所有正则都不匹配
        if re.match(r'^[\d.]+', line):
            # 尝试提取单位，检查是否是未知单位
            unit_match = re.match(r'^[\d.]+([a-zA-Z]+)', line)
            if unit_match:
                unit = unit_match.group(1).lower()
                known_units = {"us", "ms", "s", "m", "h"}
                if unit not in known_units:
                    raise ValueError(f"unknown time unit: {unit!r} in line: {line!r}")
            raise ValueError(f"malformed pprof line: {line!r}")

    return samples


def parse_pprof_csv(csv_text: str) -> dict[str, float]:
    """
    解析 pprof -csv 输出格式。

    示例输入:
        flat,flat%,sum%,cum,cum%,function
        1.23s,45.6%,45.6%,2.34s,85.7%,runtime.mallocgc

    返回: {"runtime.mallocgc": 1.23}
    """
    samples = {}
    reader = csv.reader(StringIO(csv_text))

    header = next(reader, None)
    if not header:
        return samples

    # 找到 flat 和 function 列索引
    try:
        flat_idx = header.index("flat")
        func_idx = header.index("function")
    except ValueError:
        return samples

    for row in reader:
        if len(row) <= max(flat_idx, func_idx):
            continue

        flat_str = row[flat_idx].strip()
        func = row[func_idx].strip()

        # 解析时间值
        match = re.match(r'^([\d.]+)(ms|s|us|m|h)$', flat_str)
        if match:
            value = float(match.group(1))
            unit = match.group(2)
            samples[func] = _to_seconds(value, unit)

    return samples


def parse_pprof_top(text: str) -> list[dict]:
    """
    解析 pprof -top 输出，返回详细信息列表。

    返回: [
        {"flat": 1.23, "flat_pct": 45.6, "cum": 2.34, "cum_pct": 85.7, "func": "runtime.mallocgc"},
        ...
    ]
    """
    results = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("flat") or line.startswith("-"):
            continue

        match = re.match(
            r'^([\d.]+)(ms|s|us|m|h)\s+([\d.]+)%\s+[\d.]+%\s+([\d.]+)(ms|s|us|m|h)\s+([\d.]+)%\s+(.+)$',
            line
        )
        if match:
            flat = _to_seconds(float(match.group(1)), match.group(2))
            flat_pct = float(match.group(3))
            cum = _to_seconds(float(match.group(4)), match.group(5))
            cum_pct = float(match.group(6))
            func = match.group(7).strip()

            results.append({
                "flat": flat,
                "flat_pct": flat_pct,
                "cum": cum,
                "cum_pct": cum_pct,
                "func": func,
            })

    return results


def _to_seconds(value: float, unit: str) -> float:
    """将带单位的时间值转换为秒。"""
    multipliers = {
        "us": 1e-6,
        "ms": 1e-3,
        "s": 1.0,
        "m": 60.0,
        "h": 3600.0,
    }
    if unit not in multipliers:
        raise ValueError(f"unknown time unit: {unit!r}")
    return value * multipliers[unit]


def flatten_stacks(samples: dict[str, float]) -> dict[str, int]:
    """
    将 pprof 函数采样转换为折叠栈格式（每个函数独立一行）。
    用于生成简单火焰图数据。
    """
    return {func: int(count * 1000) for func, count in samples.items()}
