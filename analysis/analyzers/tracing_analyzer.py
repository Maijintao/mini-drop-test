"""
Tracing 分析器

解析通用 tracing/span 时序数据，统计延迟分布和慢请求。
输入：tracing JSON 或 CSV
输出：延迟统计和 Top N 慢事件
"""
import csv
import json
from dataclasses import dataclass, field
from io import StringIO


@dataclass
class TraceEvent:
    """单个 trace 事件"""
    timestamp: float = 0.0
    name: str = ""
    duration_ms: float = 0.0
    service: str = ""
    status: str = ""


@dataclass
class TracingResult:
    """Tracing 分析结果"""
    total_events: int = 0
    avg_duration_ms: float = 0.0
    max_duration_ms: float = 0.0
    p50_duration_ms: float = 0.0
    p99_duration_ms: float = 0.0
    slow_events: list[TraceEvent] = field(default_factory=list)
    by_service: dict[str, dict] = field(default_factory=dict)
    summary: str = ""


def parse_tracing_json(text: str) -> list[TraceEvent]:
    """
    解析 JSON 格式的 tracing 数据。

    支持两种格式:
    1. 数组: [{"timestamp": ..., "name": ..., "duration": ..., "service": ...}, ...]
    2. 对象包裹: {"spans": [...], "events": [...], "data": [...]}
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []

    if isinstance(data, dict):
        for key in ("spans", "events", "data", "records", "traces"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        else:
            # 尝试取第一个 list 值
            for v in data.values():
                if isinstance(v, list):
                    data = v
                    break
            else:
                return []

    if not isinstance(data, list):
        return []

    events = []
    for item in data:
        if not isinstance(item, dict):
            continue
        # 兼容多种字段名
        duration = item.get("duration_ms") or item.get("duration") or item.get("latency_ms") or 0
        # 如果 duration 单位是微秒或纳秒，自动转换
        if isinstance(duration, (int, float)) and duration > 100000:
            # 可能是纳秒
            duration = duration / 1_000_000
        elif isinstance(duration, (int, float)) and duration > 10000:
            # 可能是微秒
            duration = duration / 1000

        events.append(TraceEvent(
            timestamp=float(item.get("timestamp") or item.get("ts") or item.get("time") or 0),
            name=str(item.get("name") or item.get("operation") or item.get("span_name") or ""),
            duration_ms=float(duration),
            service=str(item.get("service") or item.get("service_name") or ""),
            status=str(item.get("status") or item.get("state") or ""),
        ))

    return events


def parse_tracing_csv(text: str) -> list[TraceEvent]:
    """
    解析 CSV 格式的 tracing 数据。

    CSV 格式预期:
        timestamp,name,duration_ms,service,status
    """
    events = []
    reader = csv.reader(StringIO(text))

    header = next(reader, None)
    if not header:
        return []

    # 尝试识别列索引
    lower_header = [h.strip().lower() for h in header]
    ts_idx = _find_col(lower_header, ["timestamp", "ts", "time"])
    name_idx = _find_col(lower_header, ["name", "operation", "span_name"])
    dur_idx = _find_col(lower_header, ["duration_ms", "duration", "latency_ms", "latency"])
    svc_idx = _find_col(lower_header, ["service", "service_name"])
    status_idx = _find_col(lower_header, ["status", "state"])

    for row in reader:
        if len(row) < 2:
            continue
        try:
            dur = float(row[dur_idx]) if dur_idx is not None and dur_idx < len(row) else 0
            if dur > 100000:
                dur /= 1_000_000
            elif dur > 10000:
                dur /= 1000

            events.append(TraceEvent(
                timestamp=float(row[ts_idx]) if ts_idx is not None and ts_idx < len(row) else 0,
                name=row[name_idx].strip() if name_idx is not None and name_idx < len(row) else "",
                duration_ms=dur,
                service=row[svc_idx].strip() if svc_idx is not None and svc_idx < len(row) else "",
                status=row[status_idx].strip() if status_idx is not None and status_idx < len(row) else "",
            ))
        except (ValueError, IndexError):
            continue

    return events


def _find_col(header: list[str], candidates: list[str]) -> int | None:
    """从表头中查找列索引。"""
    for c in candidates:
        if c in header:
            return header.index(c)
    return None


def analyze_tracing(events: list[TraceEvent], slow_threshold_ms: float = 100) -> TracingResult:
    """
    分析 tracing 事件，生成统计结果。

    Args:
        events: TraceEvent 列表
        slow_threshold_ms: 慢请求阈值 (ms)，默认 100ms

    Returns:
        TracingResult 统计结果
    """
    if not events:
        return TracingResult(summary="No tracing events to analyze")

    durations = sorted([e.duration_ms for e in events])
    avg_dur = sum(durations) / len(durations)
    p50 = durations[len(durations) // 2]
    p99 = durations[int(len(durations) * 0.99)]
    max_dur = durations[-1]

    slow_events = [e for e in events if e.duration_ms >= slow_threshold_ms]

    # 按 service 统计
    by_service: dict[str, dict] = {}
    for e in events:
        svc = e.service or "(unknown)"
        if svc not in by_service:
            by_service[svc] = {"count": 0, "total_ms": 0, "max_ms": 0}
        by_service[svc]["count"] += 1
        by_service[svc]["total_ms"] += e.duration_ms
        by_service[svc]["max_ms"] = max(by_service[svc]["max_ms"], e.duration_ms)

    for svc in by_service:
        cnt = by_service[svc]["count"]
        by_service[svc]["avg_ms"] = round(by_service[svc]["total_ms"] / cnt, 2)

    summary = (
        f"共 {len(events)} 个 trace 事件, "
        f"延迟 avg={avg_dur:.1f}ms p99={p99:.1f}ms max={max_dur:.1f}ms, "
        f"慢请求 (>{slow_threshold_ms}ms): {len(slow_events)} 个"
    )

    return TracingResult(
        total_events=len(events),
        avg_duration_ms=avg_dur,
        max_duration_ms=max_dur,
        p50_duration_ms=p50,
        p99_duration_ms=p99,
        slow_events=slow_events[:100],
        by_service=by_service,
        summary=summary,
    )


def tracing_to_json(result: TracingResult) -> str:
    """将分析结果序列化为 JSON。"""
    data = {
        "total_events": result.total_events,
        "avg_duration_ms": round(result.avg_duration_ms, 2),
        "max_duration_ms": round(result.max_duration_ms, 2),
        "p50_duration_ms": round(result.p50_duration_ms, 2),
        "p99_duration_ms": round(result.p99_duration_ms, 2),
        "slow_event_count": len(result.slow_events),
        "slow_events": [
            {
                "ts": e.timestamp,
                "name": e.name,
                "duration_ms": e.duration_ms,
                "service": e.service,
                "status": e.status,
            }
            for e in result.slow_events[:50]
        ],
        "by_service": result.by_service,
        "summary": result.summary,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)
