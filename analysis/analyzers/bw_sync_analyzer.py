"""
带宽同步分析器

分析 IO/带宽相关的时序数据，检测同步阻塞问题。
输入：时序数据文件（CSV 或 JSON 格式）
输出：同步阻塞检测结果
"""
import csv
import json
from dataclasses import dataclass, field
from io import StringIO
from typing import Optional


@dataclass
class SyncEvent:
    """单个同步阻塞事件"""
    timestamp: float
    duration: float
    thread_id: str = ""
    call_site: str = ""
    io_size: int = 0
    latency_ms: float = 0.0


@dataclass
class BwSyncResult:
    """带宽同步分析结果"""
    total_events: int = 0
    sync_events: list[SyncEvent] = field(default_factory=list)
    avg_latency_ms: float = 0.0
    max_latency_ms: float = 0.0
    sync_ratio: float = 0.0  # 同步事件占比
    summary: str = ""


def analyze_bw_sync_csv(csv_text: str, latency_threshold_ms: float = 10.0) -> BwSyncResult:
    """
    分析 CSV 格式的带宽/IO 时序数据。

    CSV 格式预期:
        timestamp,duration,thread_id,call_site,io_size,latency_ms

    Args:
        csv_text: CSV 文本内容
        latency_threshold_ms: 延迟阈值，超过则认为是同步阻塞

    Returns:
        BwSyncResult 分析结果
    """
    events = []
    reader = csv.DictReader(StringIO(csv_text))

    for row in reader:
        try:
            event = SyncEvent(
                timestamp=float(row.get("timestamp", 0)),
                duration=float(row.get("duration", 0)),
                thread_id=row.get("thread_id", ""),
                call_site=row.get("call_site", ""),
                io_size=int(row.get("io_size", 0)),
                latency_ms=float(row.get("latency_ms", 0)),
            )
            events.append(event)
        except (ValueError, KeyError):
            continue

    return _analyze_events(events, latency_threshold_ms)


def analyze_bw_sync_json(json_text: str, latency_threshold_ms: float = 10.0) -> BwSyncResult:
    """
    分析 JSON 格式的带宽/IO 时序数据。

    JSON 格式预期:
        [{"timestamp": 1.0, "duration": 0.5, "thread_id": "t1", ...}, ...]

    Args:
        json_text: JSON 文本内容
        latency_threshold_ms: 延迟阈值

    Returns:
        BwSyncResult 分析结果
    """
    try:
        data = json.loads(json_text)
    except json.JSONDecodeError as e:
        return BwSyncResult(summary=f"JSON parse error: {e}")

    events = []
    for item in data:
        event = SyncEvent(
            timestamp=float(item.get("timestamp", 0)),
            duration=float(item.get("duration", 0)),
            thread_id=item.get("thread_id", ""),
            call_site=item.get("call_site", ""),
            io_size=int(item.get("io_size", 0)),
            latency_ms=float(item.get("latency_ms", 0)),
        )
        events.append(event)

    return _analyze_events(events, latency_threshold_ms)


def _analyze_events(events: list[SyncEvent], latency_threshold_ms: float) -> BwSyncResult:
    """分析事件列表，检测同步阻塞。"""
    if not events:
        return BwSyncResult(summary="No events to analyze")

    # 筛选同步阻塞事件
    sync_events = [e for e in events if e.latency_ms >= latency_threshold_ms]

    # 统计
    total_latency = sum(e.latency_ms for e in events)
    max_latency = max(e.latency_ms for e in events) if events else 0
    avg_latency = total_latency / len(events) if events else 0
    sync_ratio = len(sync_events) / len(events) if events else 0

    # 生成摘要
    if sync_events:
        summary = (
            f"检测到 {len(sync_events)} 个同步阻塞事件 "
            f"(占比 {sync_ratio:.1%})，"
            f"最大延迟 {max_latency:.1f}ms，平均延迟 {avg_latency:.1f}ms"
        )
    else:
        summary = f"未检测到同步阻塞，平均延迟 {avg_latency:.1f}ms"

    return BwSyncResult(
        total_events=len(events),
        sync_events=sync_events,
        avg_latency_ms=avg_latency,
        max_latency_ms=max_latency,
        sync_ratio=sync_ratio,
        summary=summary,
    )
