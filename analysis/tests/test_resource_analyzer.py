"""测试 PidStats 资源分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.resource_analyzer import (
    parse_pidstat_csv,
    parse_proc_stat,
    analyze_resources,
    samples_to_json,
    samples_to_csv,
    ResourceSample,
)


def test_parse_pidstat_csv():
    """解析 pidstat CSV 格式"""
    csv = "timestamp,cpu_pct,mem_rss_kb,mem_vsz_kb,io_read_bytes,io_write_bytes,threads\n"
    csv += "1.0,10.5,102400,512000,0,0,4\n"
    csv += "2.0,25.3,106496,512000,4096,8192,4\n"
    csv += "3.0,5.1,102400,512000,8192,16384,5\n"

    samples = parse_pidstat_csv(csv)
    assert len(samples) == 3
    assert samples[0].cpu_pct == 10.5
    assert samples[1].mem_rss_kb == 106496
    assert samples[2].threads == 5


def test_parse_proc_stat():
    """解析 /proc/pid/stat 格式"""
    text = "1.0 100 50 512000 25600\n2.0 200 100 524288 26000\n"
    samples = parse_proc_stat(text)
    assert len(samples) == 2
    assert samples[0].timestamp == 1.0
    assert samples[0].cpu_pct == 1.5  # (100+50)/100
    assert samples[1].cpu_pct == 3.0  # (200+100)/100


def test_analyze_resources_basic():
    """基本资源分析"""
    samples = [
        ResourceSample(timestamp=1.0, cpu_pct=10.0, mem_rss_kb=100000, io_read_bytes=0, io_write_bytes=0),
        ResourceSample(timestamp=2.0, cpu_pct=50.0, mem_rss_kb=200000, io_read_bytes=1024, io_write_bytes=2048),
        ResourceSample(timestamp=3.0, cpu_pct=30.0, mem_rss_kb=150000, io_read_bytes=2048, io_write_bytes=4096),
    ]
    stats = analyze_resources(samples)
    assert stats.cpu_avg == 30.0
    assert stats.cpu_max == 50.0
    assert stats.mem_max_kb == 200000
    assert stats.io_read_total == 2048
    assert stats.io_write_total == 4096


def test_analyze_resources_empty():
    """空输入"""
    stats = analyze_resources([])
    assert "No samples" in stats.summary


def test_samples_to_json():
    """JSON 序列化"""
    samples = [ResourceSample(timestamp=1.0, cpu_pct=10.0, mem_rss_kb=100000)]
    stats = analyze_resources(samples)
    json_str = samples_to_json(stats)
    import json
    data = json.loads(json_str)
    assert data["cpu_avg"] == 10.0


if __name__ == "__main__":
    test_parse_pidstat_csv()
    test_parse_proc_stat()
    test_analyze_resources_basic()
    test_analyze_resources_empty()
    test_samples_to_json()
    print("ALL PASSED")
