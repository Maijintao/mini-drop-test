"""测试 Tracing 分析器"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.tracing_analyzer import (
    parse_tracing_json, parse_tracing_csv, analyze_tracing, tracing_to_json,
)


def test_parse_tracing_json_array():
    """解析 JSON 数组格式"""
    events = parse_tracing_json(json.dumps([
        {"timestamp": 1.0, "name": "GET /api", "duration_ms": 50, "service": "web"},
        {"timestamp": 2.0, "name": "DB query", "duration_ms": 200, "service": "db"},
    ]))
    assert len(events) == 2
    assert events[0].name == "GET /api"
    assert events[1].duration_ms == 200


def test_parse_tracing_json_wrapped():
    """解析包裹格式 {"spans": [...]}"""
    data = {"spans": [
        {"ts": 1.0, "operation": "rpc.Call", "latency_ms": 30, "service_name": "svc"},
    ]}
    events = parse_tracing_json(json.dumps(data))
    assert len(events) == 1
    assert events[0].name == "rpc.Call"


def test_parse_tracing_csv():
    """解析 CSV 格式"""
    csv_text = "timestamp,name,duration_ms,service,status\n1.0,GET /api,50,web,ok\n2.0,DB query,200,db,ok"
    events = parse_tracing_csv(csv_text)
    assert len(events) == 2
    assert events[1].name == "DB query"


def test_analyze_tracing():
    """分析结果统计"""
    events = parse_tracing_json(json.dumps([
        {"duration_ms": 10}, {"duration_ms": 20}, {"duration_ms": 300},
    ]))
    result = analyze_tracing(events, slow_threshold_ms=100)
    assert result.total_events == 3
    assert len(result.slow_events) == 1
    assert result.max_duration_ms == 300


def test_analyze_tracing_empty():
    """空事件列表"""
    result = analyze_tracing([])
    assert result.total_events == 0
    assert "No tracing events" in result.summary


def test_tracing_to_json():
    """JSON 序列化"""
    events = parse_tracing_json(json.dumps([{"duration_ms": 50}]))
    result = analyze_tracing(events)
    output = json.loads(tracing_to_json(result))
    assert output["total_events"] == 1
    assert "summary" in output


if __name__ == "__main__":
    test_parse_tracing_json_array()
    test_parse_tracing_json_wrapped()
    test_parse_tracing_csv()
    test_analyze_tracing()
    test_analyze_tracing_empty()
    test_tracing_to_json()
    print("ALL PASSED")
