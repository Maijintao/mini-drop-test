"""测试 eBPF biosnoop 分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.biotrace import (
    parse_biosnoop_csv,
    parse_biosnoop_text,
    analyze_biosnoop,
    stats_to_json,
    BioEvent,
)


def test_parse_biosnoop_csv():
    """解析 biosnoop CSV 格式"""
    csv = "TIME(s),COMM,PID,DISK,T,BYTES,LAT(ns)\n"
    csv += "0.000000,bash,1234,sda,R,4096,12345\n"
    csv += "0.001000,dd,5678,sda,W,131072,98765\n"

    events = parse_biosnoop_csv(csv)
    assert len(events) == 2
    assert events[0].comm == "bash"
    assert events[0].direction == "R"
    assert events[0].io_size == 4096
    assert events[1].direction == "W"
    assert events[1].latency_us == 98.765


def test_parse_biosnoop_text():
    """解析 biosnoop 文本格式"""
    text = """TIME(s)     COMM           PID    DISK    T  BYTES   LAT(ns)
0.000000    bash           1234   sda     R  4096    12345
0.001000    dd             5678   sdb     W  131072  98765
"""
    events = parse_biosnoop_text(text)
    assert len(events) == 2
    assert events[0].disk == "sda"
    assert events[1].disk == "sdb"


def test_analyze_biosnoop_basic():
    """基本分析"""
    events = [
        BioEvent(timestamp=0.0, comm="bash", pid=1, disk="sda", direction="R", io_size=4096, latency_us=100),
        BioEvent(timestamp=0.1, comm="dd", pid=2, disk="sda", direction="W", io_size=131072, latency_us=500),
        BioEvent(timestamp=0.2, comm="bash", pid=1, disk="sda", direction="R", io_size=8192, latency_us=20000),
    ]
    stats = analyze_biosnoop(events, slow_threshold_us=10000)
    assert stats.total_events == 3
    assert stats.read_count == 2
    assert stats.write_count == 1
    assert stats.read_bytes == 12288
    assert stats.write_bytes == 131072
    assert len(stats.slow_ios) == 1
    assert stats.slow_ios[0].latency_us == 20000


def test_analyze_biosnoop_empty():
    """空输入"""
    stats = analyze_biosnoop([])
    assert "No IO events" in stats.summary


def test_stats_to_json():
    """JSON 序列化"""
    events = [
        BioEvent(timestamp=0.0, comm="bash", pid=1, disk="sda", direction="R", io_size=4096, latency_us=100),
    ]
    stats = analyze_biosnoop(events)
    json_str = stats_to_json(stats)
    import json
    data = json.loads(json_str)
    assert data["total_events"] == 1
    assert "sda" in data["by_disk"]


if __name__ == "__main__":
    test_parse_biosnoop_csv()
    test_parse_biosnoop_text()
    test_analyze_biosnoop_basic()
    test_analyze_biosnoop_empty()
    test_stats_to_json()
    print("ALL PASSED")
