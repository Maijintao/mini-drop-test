"""
PidStats 资源曲线分析器

解析 /proc/<pid>/stat 数据，生成 CPU/内存/IO 资源时序曲线。
输入：CSV 格式的时序采样数据
输出：资源使用统计和曲线数据
"""
import csv
import json
from dataclasses import dataclass, field
from io import StringIO
from typing import Optional


@dataclass
class ResourceSample:
    """单个资源采样点"""
    timestamp: float
    cpu_pct: float = 0.0        # CPU 使用率 (%)
    mem_rss_kb: int = 0         # RSS 内存 (KB)
    mem_vsz_kb: int = 0         # 虚拟内存 (KB)
    io_read_bytes: int = 0      # 累计读字节
    io_write_bytes: int = 0     # 累计写字节
    threads: int = 0            # 线程数


@dataclass
class ResourceStats:
    """资源统计结果"""
    samples: list[ResourceSample] = field(default_factory=list)
    cpu_avg: float = 0.0
    cpu_max: float = 0.0
    mem_avg_kb: int = 0
    mem_max_kb: int = 0
    io_read_total: int = 0
    io_write_total: int = 0
    duration_sec: float = 0.0
    summary: str = ""


def parse_pidstat_csv(csv_text: str) -> list[ResourceSample]:
    """
    解析 pidstat 或自定义 CSV 格式的资源采样数据。

    CSV 格式预期:
        timestamp,cpu_pct,mem_rss_kb,mem_vsz_kb,io_read_bytes,io_write_bytes,threads

    Args:
        csv_text: CSV 文本内容

    Returns:
        ResourceSample 列表
    """
    samples = []
    reader = csv.DictReader(StringIO(csv_text))

    for row in reader:
        try:
            sample = ResourceSample(
                timestamp=float(row.get("timestamp", 0)),
                cpu_pct=float(row.get("cpu_pct", 0)),
                mem_rss_kb=int(float(row.get("mem_rss_kb", 0))),
                mem_vsz_kb=int(float(row.get("mem_vsz_kb", 0))),
                io_read_bytes=int(float(row.get("io_read_bytes", 0))),
                io_write_bytes=int(float(row.get("io_write_bytes", 0))),
                threads=int(row.get("threads", 0)),
            )
            samples.append(sample)
        except (ValueError, KeyError):
            continue

    return samples


def parse_proc_stat(text: str) -> list[ResourceSample]:
    """
    解析 /proc/<pid>/stat 采样文本。

    格式: 每行一个采样，字段用空格分隔:
        timestamp utime stime vsize rss ...

    Args:
        text: 采样文本

    Returns:
        ResourceSample 列表
    """
    samples = []
    for line in text.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        try:
            ts = float(parts[0])
            utime = int(parts[1])
            stime = int(parts[2])
            vsize = int(parts[3])
            rss = int(parts[4])

            # CPU 使用率估算 (utime + stime 转换为百分比)
            # 假设采样间隔 1 秒，CLK_TCK=100
            cpu_pct = (utime + stime) / 100.0

            samples.append(ResourceSample(
                timestamp=ts,
                cpu_pct=cpu_pct,
                mem_rss_kb=rss * 4,  # RSS 页数转 KB (假设 4KB/页)
                mem_vsz_kb=vsize // 1024,  # 字节转 KB
            ))
        except (ValueError, IndexError):
            continue

    return samples


def analyze_resources(samples: list[ResourceSample]) -> ResourceStats:
    """
    分析资源采样数据，生成统计结果。

    Args:
        samples: ResourceSample 列表

    Returns:
        ResourceStats 统计结果
    """
    if not samples:
        return ResourceStats(summary="No samples to analyze")

    # 计算统计
    cpu_values = [s.cpu_pct for s in samples]
    mem_values = [s.mem_rss_kb for s in samples]

    cpu_avg = sum(cpu_values) / len(cpu_values)
    cpu_max = max(cpu_values)
    mem_avg = sum(mem_values) / len(mem_values)
    mem_max = max(mem_values)

    # IO 增量计算
    io_read_total = 0
    io_write_total = 0
    for i in range(1, len(samples)):
        read_diff = samples[i].io_read_bytes - samples[i-1].io_read_bytes
        write_diff = samples[i].io_write_bytes - samples[i-1].io_write_bytes
        if read_diff >= 0:
            io_read_total += read_diff
        if write_diff >= 0:
            io_write_total += write_diff

    # 时长
    duration = samples[-1].timestamp - samples[0].timestamp if len(samples) > 1 else 0

    summary = (
        f"CPU 平均 {cpu_avg:.1f}% (峰值 {cpu_max:.1f}%), "
        f"内存 平均 {mem_avg//1024}MB (峰值 {mem_max//1024}MB), "
        f"IO 读 {io_read_total//1024}KB 写 {io_write_total//1024}KB"
    )

    return ResourceStats(
        samples=samples,
        cpu_avg=cpu_avg,
        cpu_max=cpu_max,
        mem_avg_kb=int(mem_avg),
        mem_max_kb=mem_max,
        io_read_total=io_read_total,
        io_write_total=io_write_total,
        duration_sec=duration,
        summary=summary,
    )


def samples_to_json(stats: ResourceStats) -> str:
    """将资源统计序列化为 JSON。"""
    data = {
        "cpu_avg": stats.cpu_avg,
        "cpu_max": stats.cpu_max,
        "mem_avg_kb": stats.mem_avg_kb,
        "mem_max_kb": stats.mem_max_kb,
        "io_read_total": stats.io_read_total,
        "io_write_total": stats.io_write_total,
        "duration_sec": stats.duration_sec,
        "samples_count": len(stats.samples),
        "summary": stats.summary,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def samples_to_csv(stats: ResourceStats) -> str:
    """将采样数据导出为 CSV。"""
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "cpu_pct", "mem_rss_kb", "io_read_bytes", "io_write_bytes"])
    for s in stats.samples:
        writer.writerow([s.timestamp, s.cpu_pct, s.mem_rss_kb, s.io_read_bytes, s.io_write_bytes])
    return output.getvalue()
