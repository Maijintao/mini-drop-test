"""测试带宽同步分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.bw_sync_analyzer import (
    analyze_bw_sync_csv,
    analyze_bw_sync_json,
    BwSyncResult,
    SyncEvent,
)
from analyzers.detect_bw_sync import detect_anomalies, format_report


def test_analyze_csv_basic():
    """解析 CSV 格式数据"""
    csv = "timestamp,duration,thread_id,call_site,io_size,latency_ms\n"
    csv += "1.0,0.5,t1,read,1024,5.0\n"
    csv += "2.0,1.5,t2,write,4096,15.0\n"
    csv += "3.0,0.3,t1,read,512,8.0\n"

    result = analyze_bw_sync_csv(csv, latency_threshold_ms=10.0)
    assert result.total_events == 3
    assert len(result.sync_events) == 1
    assert result.sync_events[0].latency_ms == 15.0
    assert result.max_latency_ms == 15.0


def test_analyze_json_basic():
    """解析 JSON 格式数据"""
    data = [
        {"timestamp": 1.0, "duration": 0.5, "thread_id": "t1", "latency_ms": 5.0},
        {"timestamp": 2.0, "duration": 1.5, "thread_id": "t2", "latency_ms": 20.0},
    ]
    import json
    result = analyze_bw_sync_json(json.dumps(data), latency_threshold_ms=10.0)
    assert result.total_events == 2
    assert len(result.sync_events) == 1
    assert result.sync_events[0].latency_ms == 20.0


def test_analyze_empty_csv():
    """空 CSV 输入"""
    result = analyze_bw_sync_csv("timestamp,duration\n")
    assert result.total_events == 0
    assert "No events" in result.summary


def test_sync_ratio_calculation():
    """同步阻塞占比计算"""
    csv = "timestamp,duration,thread_id,call_site,io_size,latency_ms\n"
    csv += "1.0,0.5,t1,read,1024,5.0\n"
    csv += "2.0,1.5,t2,write,4096,15.0\n"
    csv += "3.0,0.3,t1,read,512,20.0\n"
    csv += "4.0,0.2,t3,read,256,3.0\n"

    result = analyze_bw_sync_csv(csv, latency_threshold_ms=10.0)
    assert result.sync_ratio == 0.5  # 2/4


def test_detect_anomalies():
    """异常检测"""
    sync_events = [
        SyncEvent(timestamp=float(i), duration=0.5, latency_ms=10.0,
                  thread_id="t1", call_site="read", io_size=100)
        for i in range(9)
    ]
    sync_events.append(
        SyncEvent(timestamp=9.0, duration=5.0, latency_ms=300.0,
                  thread_id="t2", call_site="write", io_size=400)
    )
    result = BwSyncResult(total_events=10, sync_events=sync_events)
    anomalies = detect_anomalies(result, zscore_threshold=2.0)
    assert len(anomalies) >= 1
    assert anomalies[0]["latency_ms"] == 300.0


def test_format_report():
    """报告格式化"""
    result = BwSyncResult(
        total_events=5,
        sync_ratio=0.4,
        avg_latency_ms=15.0,
        max_latency_ms=30.0,
        summary="检测到 2 个同步阻塞事件",
    )
    report = format_report(result, [])
    assert "总事件数" in report
    assert "5" in report


if __name__ == "__main__":
    test_analyze_csv_basic()
    test_analyze_json_basic()
    test_analyze_empty_csv()
    test_sync_ratio_calculation()
    test_detect_anomalies()
    test_format_report()
    print("ALL PASSED")
