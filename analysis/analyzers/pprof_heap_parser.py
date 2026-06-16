"""
pprof Heap 数据解析器

解析 go tool pprof 输出的 heap profile 数据。
支持指标：
- alloc_objects / alloc_space: 累计分配
- inuse_objects / inuse_space: 当前占用

支持格式：
1. 文本格式 (go tool pprof -text)
2. CSV 格式 (go tool pprof -csv)
"""
import csv
import re
from io import StringIO
from dataclasses import dataclass


@dataclass
class HeapSample:
    """单个函数的堆内存采样数据。"""
    func: str
    flat_objects: int = 0
    flat_space: int = 0
    cum_objects: int = 0
    cum_space: int = 0


def parse_heap_text(text: str) -> list[HeapSample]:
    """
    解析 pprof -text -inuse_space 或 -alloc_space 输出。

    示例输入 (inuse_space):
        flat  flat%   sum%        cum   cum%
        1.23MB 45.6% 45.6%     2.34MB 85.7%  runtime.mallocgc

    返回 HeapSample 列表。
    """
    samples = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("flat") or line.startswith("-"):
            continue

        match = re.match(
            r'^([\d.]+)(B|KB|MB|GB|TB)\s+([\d.]+)%\s+[\d.]+%\s+([\d.]+)(B|KB|MB|GB|TB)\s+([\d.]+)%\s+(.+)$',
            line
        )
        if match:
            flat_space = _to_bytes(float(match.group(1)), match.group(2))
            cum_space = _to_bytes(float(match.group(4)), match.group(5))
            func = match.group(7).strip()

            samples.append(HeapSample(
                func=func,
                flat_space=flat_space,
                cum_space=cum_space,
            ))

    return samples


def parse_heap_csv(csv_text: str) -> list[HeapSample]:
    """
    解析 pprof -csv 输出的 heap 数据。

    返回 HeapSample 列表。
    """
    samples = []
    reader = csv.reader(StringIO(csv_text))

    header = next(reader, None)
    if not header:
        return samples

    # 动态查找列索引
    col_map = {}
    for i, col in enumerate(header):
        col = col.strip().lower()
        if col == "function":
            col_map["func"] = i
        elif "flat" in col and ("obj" in col or "objects" in col):
            col_map["flat_objects"] = i
        elif "cum" in col and ("obj" in col or "objects" in col):
            col_map["cum_objects"] = i
        elif "flat" in col and ("space" in col or "mem" in col):
            col_map["flat_space"] = i
        elif "cum" in col and ("space" in col or "mem" in col):
            col_map["cum_space"] = i
        # 简单格式: flat 和 cum 列（无 objects/space 区分时默认为 space）
        elif col == "flat" and "flat_space" not in col_map:
            col_map["flat_space"] = i
        elif col == "cum" and "cum_space" not in col_map:
            col_map["cum_space"] = i

    if "func" not in col_map:
        return samples

    for row in reader:
        if len(row) <= max(col_map.values()):
            continue

        func = row[col_map["func"]].strip()
        sample = HeapSample(func=func)

        if "flat_objects" in col_map:
            sample.flat_objects = _parse_int(row[col_map["flat_objects"]])
        if "flat_space" in col_map:
            sample.flat_space = _parse_bytes(row[col_map["flat_space"]])
        if "cum_objects" in col_map:
            sample.cum_objects = _parse_int(row[col_map["cum_objects"]])
        if "cum_space" in col_map:
            sample.cum_space = _parse_bytes(row[col_map["cum_space"]])

        samples.append(sample)

    return samples


def parse_heap_top(text: str) -> list[dict]:
    """
    解析 pprof -top 输出的 heap 数据，返回详细信息字典列表。

    返回: [
        {"func": "...", "flat": 1234, "flat_pct": 45.6, "cum": 5678, "cum_pct": 85.7},
        ...
    ]
    """
    results = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("flat") or line.startswith("-"):
            continue

        match = re.match(
            r'^([\d.]+)(B|KB|MB|GB|TB)\s+([\d.]+)%\s+[\d.]+%\s+([\d.]+)(B|KB|MB|GB|TB)\s+([\d.]+)%\s+(.+)$',
            line
        )
        if match:
            flat = _to_bytes(float(match.group(1)), match.group(2))
            flat_pct = float(match.group(3))
            cum = _to_bytes(float(match.group(4)), match.group(5))
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


def get_top_allocators(samples: list[HeapSample], top_n: int = 10) -> list[HeapSample]:
    """按累计分配空间排序，返回 top N 分配器。"""
    return sorted(samples, key=lambda s: s.cum_space, reverse=True)[:top_n]


def get_top_inuse(samples: list[HeapSample], top_n: int = 10) -> list[HeapSample]:
    """按当前占用空间排序，返回 top N 占用者。"""
    return sorted(samples, key=lambda s: s.flat_space, reverse=True)[:top_n]


def _to_bytes(value: float, unit: str) -> int:
    """将带单位的大小值转换为字节。"""
    multipliers = {
        "B": 1,
        "KB": 1024,
        "MB": 1024 ** 2,
        "GB": 1024 ** 3,
        "TB": 1024 ** 4,
    }
    return int(value * multipliers.get(unit, 1))


def _parse_bytes(s: str) -> int:
    """解析 '1.23MB' 格式的字符串为字节。"""
    match = re.match(r'^([\d.]+)(B|KB|MB|GB|TB)$', s.strip())
    if match:
        return _to_bytes(float(match.group(1)), match.group(2))
    return 0


def _parse_int(s: str) -> int:
    """解析带逗号的整数，如 '1,234'。"""
    return int(s.replace(",", "").strip() or "0")
