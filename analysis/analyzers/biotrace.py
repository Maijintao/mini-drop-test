"""
eBPF biosnoop 分析器

解析 BCC biosnoop 工具输出，分析块设备 IO 延迟和模式。
输入：biosnoop CSV 输出
输出：IO 延迟统计和异常检测
"""
import csv
import json
from dataclasses import dataclass, field
from io import StringIO
from typing import Optional


@dataclass
class BioEvent:
    """单个 IO 事件"""
    timestamp: float
    comm: str = ""          # 进程名
    pid: int = 0
    disk: str = ""          # 设备名
    direction: str = ""     # R/W
    io_size: int = 0        # 字节
    latency_us: float = 0   # 延迟 (微秒)
    sector: int = 0         # 扇区号


@dataclass
class BioStats:
    """IO 统计结果"""
    total_events: int = 0
    read_count: int = 0
    write_count: int = 0
    read_bytes: int = 0
    write_bytes: int = 0
    latency_avg_us: float = 0.0
    latency_p50_us: float = 0.0
    latency_p99_us: float = 0.0
    latency_max_us: float = 0.0
    slow_ios: list[BioEvent] = field(default_factory=list)  # 慢 IO 事件
    by_disk: dict[str, dict] = field(default_factory=dict)
    by_process: dict[str, dict] = field(default_factory=dict)
    summary: str = ""


def parse_biosnoop_csv(csv_text: str) -> list[BioEvent]:
    """
    解析 biosnoop -csv 输出。

    CSV 格式:
        TIME(s),COMM,PID,DISK,T,BYTES,LAT(ns)

    Args:
        csv_text: CSV 文本

    Returns:
        BioEvent 列表
    """
    events = []
    reader = csv.reader(StringIO(csv_text))

    # 跳过可能的表头
    header = next(reader, None)
    if header and "TIME" in header[0].upper():
        pass  # 跳过表头
    else:
        # 不是表头，尝试解析
        if header:
            event = _parse_biosnoop_row(header)
            if event:
                events.append(event)

    for row in reader:
        event = _parse_biosnoop_row(row)
        if event:
            events.append(event)

    return events


def _parse_biosnoop_row(row: list) -> Optional[BioEvent]:
    """解析单行 biosnoop 数据。"""
    if len(row) < 7:
        return None
    try:
        return BioEvent(
            timestamp=float(row[0]),
            comm=row[1].strip(),
            pid=int(row[2]),
            disk=row[3].strip(),
            direction="R" if row[4].strip().upper() == "R" else "W",
            io_size=int(row[5]),
            latency_us=float(row[6]) / 1000,  # ns -> us
        )
    except (ValueError, IndexError):
        return None


def parse_biosnoop_text(text: str) -> list[BioEvent]:
    """
    解析 biosnoop 文本输出（非 CSV 模式）。

    格式:
        TIME(s)     COMM           PID    DISK    T  BYTES   LAT(ns)
        0.000000    bash           1234   sda     R  4096    12345

    Args:
        text: 文本输出

    Returns:
        BioEvent 列表
    """
    events = []
    for line in text.strip().split("\n"):
        if not line.strip() or "TIME" in line:
            continue

        parts = line.split()
        if len(parts) < 7:
            continue

        try:
            event = BioEvent(
                timestamp=float(parts[0]),
                comm=parts[1],
                pid=int(parts[2]),
                disk=parts[3],
                direction="R" if parts[4].upper() == "R" else "W",
                io_size=int(parts[5]),
                latency_us=float(parts[6]) / 1000,
            )
            events.append(event)
        except (ValueError, IndexError):
            continue

    return events


def analyze_biosnoop(events: list[BioEvent], slow_threshold_us: float = 10000) -> BioStats:
    """
    分析 biosnoop 事件，生成统计结果。

    Args:
        events: BioEvent 列表
        slow_threshold_us: 慢 IO 阈值 (微秒)，默认 10ms

    Returns:
        BioStats 统计结果
    """
    if not events:
        return BioStats(summary="No IO events to analyze")

    # 基础统计
    read_events = [e for e in events if e.direction == "R"]
    write_events = [e for e in events if e.direction == "W"]

    read_bytes = sum(e.io_size for e in read_events)
    write_bytes = sum(e.io_size for e in write_events)

    # 延迟统计
    latencies = sorted([e.latency_us for e in events])
    latency_avg = sum(latencies) / len(latencies)
    latency_p50 = latencies[len(latencies) // 2]
    latency_p99 = latencies[int(len(latencies) * 0.99)]
    latency_max = latencies[-1]

    # 慢 IO
    slow_ios = [e for e in events if e.latency_us >= slow_threshold_us]

    # 按磁盘统计
    by_disk = {}
    for e in events:
        if e.disk not in by_disk:
            by_disk[e.disk] = {"count": 0, "bytes": 0, "latency_sum": 0}
        by_disk[e.disk]["count"] += 1
        by_disk[e.disk]["bytes"] += e.io_size
        by_disk[e.disk]["latency_sum"] += e.latency_us

    for disk in by_disk:
        count = by_disk[disk]["count"]
        by_disk[disk]["latency_avg"] = by_disk[disk]["latency_sum"] / count

    # 按进程统计 (Top 10)
    by_process = {}
    for e in events:
        if e.comm not in by_process:
            by_process[e.comm] = {"count": 0, "bytes": 0}
        by_process[e.comm]["count"] += 1
        by_process[e.comm]["bytes"] += e.io_size

    # 按字节排序取 Top 10
    top_processes = dict(
        sorted(by_process.items(), key=lambda x: x[1]["bytes"], reverse=True)[:10]
    )

    summary = (
        f"总 IO 事件 {len(events)} (读 {len(read_events)} 写 {len(write_events)}), "
        f"读 {read_bytes//1024}KB 写 {write_bytes//1024}KB, "
        f"延迟 avg={latency_avg:.0f}us p99={latency_p99:.0f}us max={latency_max:.0f}us, "
        f"慢 IO ({slow_threshold_us/1000:.0f}ms+): {len(slow_ios)} 个"
    )

    return BioStats(
        total_events=len(events),
        read_count=len(read_events),
        write_count=len(write_events),
        read_bytes=read_bytes,
        write_bytes=write_bytes,
        latency_avg_us=latency_avg,
        latency_p50_us=latency_p50,
        latency_p99_us=latency_p99,
        latency_max_us=latency_max,
        slow_ios=slow_ios,
        by_disk=by_disk,
        by_process=top_processes,
        summary=summary,
    )


def stats_to_json(stats: BioStats) -> str:
    """将统计结果序列化为 JSON。"""
    data = {
        "total_events": stats.total_events,
        "read_count": stats.read_count,
        "write_count": stats.write_count,
        "read_bytes": stats.read_bytes,
        "write_bytes": stats.write_bytes,
        "latency_avg_us": stats.latency_avg_us,
        "latency_p50_us": stats.latency_p50_us,
        "latency_p99_us": stats.latency_p99_us,
        "latency_max_us": stats.latency_max_us,
        "slow_io_count": len(stats.slow_ios),
        "by_disk": stats.by_disk,
        "top_processes": stats.by_process,
        "summary": stats.summary,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)
