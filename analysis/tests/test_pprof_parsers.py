"""测试 pprof 解析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.pprof_data_parser import parse_pprof_text, parse_pprof_csv, parse_pprof_top
from analyzers.pprof_heap_parser import parse_heap_text, parse_heap_csv, parse_heap_top, HeapSample


# ========== pprof_data_parser tests ==========

def test_parse_pprof_text_basic():
    """解析 -text 输出"""
    text = """Showing nodes accounting for 2.34s, 85.7% of 2.73s total
flat  flat%   sum%        cum   cum%
1.23s 45.1% 45.1%     2.34s 85.7%  runtime.mallocgc
0.56s 20.5% 65.6%     0.56s 20.5%  runtime.slicebytetostring
0.30s 11.0% 76.6%     0.30s 11.0%  runtime.memmove
"""
    samples = parse_pprof_text(text)
    assert len(samples) == 3
    assert abs(samples["runtime.mallocgc"] - 1.23) < 0.01
    assert abs(samples["runtime.slicebytetostring"] - 0.56) < 0.01
    assert abs(samples["runtime.memmove"] - 0.30) < 0.01


def test_parse_pprof_text_millisecond():
    """解析毫秒单位"""
    text = """flat  flat%   sum%        cum   cum%
123ms 50.0% 50.0%     200ms 80.0%  main.worker
45ms  20.0% 70.0%      45ms 20.0%  main.helper
"""
    samples = parse_pprof_text(text)
    assert abs(samples["main.worker"] - 0.123) < 0.001
    assert abs(samples["main.helper"] - 0.045) < 0.001


def test_parse_pprof_text_zero_flat_without_unit():
    """兼容 go tool pprof 对 0 flat 值不带单位的输出。"""
    text = """flat  flat%   sum%        cum   cum%
0     0% 87.47%      0.12s  0.92%  runtime.(*gcControllerState).enlistWorker
10ms  5% 92.47%      10ms   5%     main.work
"""
    samples = parse_pprof_text(text)
    assert samples["runtime.(*gcControllerState).enlistWorker"] == 0
    assert abs(samples["main.work"] - 0.01) < 0.001


def test_parse_pprof_text_empty():
    """空输入"""
    assert parse_pprof_text("") == {}
    assert parse_pprof_text("flat  flat%\n------") == {}


def test_parse_pprof_text_simple_with_sum_pct():
    """简化格式: flat flat% sum% function (无 cum 列，有 sum%)"""
    text = """flat  flat%   sum%
1.23s 45.1% 45.1% runtime.mallocgc
0.56s 20.5% 65.6% runtime.slicebytetostring
"""
    samples = parse_pprof_text(text)
    assert len(samples) == 2
    assert abs(samples["runtime.mallocgc"] - 1.23) < 0.01
    assert abs(samples["runtime.slicebytetostring"] - 0.56) < 0.01


def test_parse_pprof_text_simple_without_sum_pct():
    """简化格式: flat flat% function (无 cum 列，无 sum%)"""
    text = """flat  flat%
1.23s 45.1% runtime.mallocgc
0.56s 20.5% runtime.slicebytetostring
"""
    samples = parse_pprof_text(text)
    assert len(samples) == 2
    assert abs(samples["runtime.mallocgc"] - 1.23) < 0.01
    assert abs(samples["runtime.slicebytetostring"] - 0.56) < 0.01


def test_parse_pprof_text_unknown_unit():
    """未知时间单位应抛出异常"""
    text = """flat  flat%   sum%        cum   cum%
1.23d 45.1% 45.1%     2.34d 85.7%  runtime.mallocgc
"""
    import pytest
    with pytest.raises(ValueError, match="unknown time unit"):
        parse_pprof_text(text)


def test_parse_pprof_csv_basic():
    """解析 -csv 输出"""
    csv_text = """flat,flat%,sum%,cum,cum%,function
1.23s,45.1%,45.1%,2.34s,85.7%,runtime.mallocgc
0.56s,20.5%,65.6%,0.56s,20.5%,runtime.slicebytetostring
"""
    samples = parse_pprof_csv(csv_text)
    assert len(samples) == 2
    assert abs(samples["runtime.mallocgc"] - 1.23) < 0.01


def test_parse_pprof_top_basic():
    """解析 -top 输出"""
    text = """flat  flat%   sum%        cum   cum%
1.23s 45.1% 45.1%     2.34s 85.7%  runtime.mallocgc
0.56s 20.5% 65.6%     0.56s 20.5%  runtime.slicebytetostring
"""
    results = parse_pprof_top(text)
    assert len(results) == 2
    assert results[0]["func"] == "runtime.mallocgc"
    assert abs(results[0]["flat"] - 1.23) < 0.01
    assert abs(results[0]["flat_pct"] - 45.1) < 0.01
    assert abs(results[0]["cum"] - 2.34) < 0.01


# ========== pprof_heap_parser tests ==========

def test_parse_heap_text_inuse():
    """解析 -text -inuse_space 输出"""
    text = """flat  flat%   sum%        cum   cum%
1.23MB 45.1% 45.1%     2.34MB 85.7%  runtime.mallocgc
512KB  18.7% 63.8%     512KB 18.7%  runtime.slicebytetostring
"""
    samples = parse_heap_text(text)
    assert len(samples) == 2
    assert samples[0].func == "runtime.mallocgc"
    assert samples[0].flat_space == int(1.23 * 1024 * 1024)
    assert samples[1].flat_space == 512 * 1024


def test_parse_heap_text_alloc():
    """解析 -text -alloc_space 输出"""
    text = """flat  flat%   sum%        cum   cum%
1.50GB 60.0% 60.0%     2.00GB 80.0%  main.allocate
256MB  10.0% 70.0%     256MB 10.0%  main.cache
"""
    samples = parse_heap_text(text)
    assert len(samples) == 2
    assert samples[0].flat_space == int(1.5 * 1024 ** 3)
    assert samples[1].flat_space == 256 * 1024 ** 2


def test_parse_heap_csv_basic():
    """解析 -csv 输出"""
    csv_text = """flat,flat%,sum%,cum,cum%,function
1.23MB,45.1%,45.1%,2.34MB,85.7%,runtime.mallocgc
"""
    samples = parse_heap_csv(csv_text)
    assert len(samples) == 1
    assert samples[0].func == "runtime.mallocgc"
    assert samples[0].flat_space == int(1.23 * 1024 * 1024)


def test_parse_heap_top_basic():
    """解析 -top 输出"""
    text = """flat  flat%   sum%        cum   cum%
1.23MB 45.1% 45.1%     2.34MB 85.7%  runtime.mallocgc
"""
    results = parse_heap_top(text)
    assert len(results) == 1
    assert results[0]["func"] == "runtime.mallocgc"
    assert results[0]["flat_pct"] == 45.1


def test_get_top_allocators():
    """排序 top N 分配器"""
    samples = [
        HeapSample(func="a", cum_space=100),
        HeapSample(func="b", cum_space=300),
        HeapSample(func="c", cum_space=200),
    ]
    from analyzers.pprof_heap_parser import get_top_allocators
    top = get_top_allocators(samples, top_n=2)
    assert len(top) == 2
    assert top[0].func == "b"
    assert top[1].func == "c"


def test_parse_heap_text_empty():
    """空输入"""
    assert parse_heap_text("") == []


def test_parse_heap_text_objects():
    """解析 -inuse_objects 输出（对象数格式，无单位）"""
    text = """flat  flat%   sum%        cum   cum%
1,234 45.1% 45.1%     5,678 85.7%  runtime.mallocgc
500   18.7% 63.8%     500   18.7%  runtime.slicebytetostring
"""
    samples = parse_heap_text(text)
    assert len(samples) == 2
    assert samples[0].func == "runtime.mallocgc"
    assert samples[0].flat_space == 1234
    assert samples[0].cum_space == 5678
    assert samples[1].func == "runtime.slicebytetostring"
    assert samples[1].flat_space == 500


def test_parse_heap_text_no_sum_pct():
    """解析无 sum% 列的格式"""
    text = """flat  flat%        cum   cum%
1.23MB 45.1%     2.34MB 85.7%  runtime.mallocgc
512KB  18.7%     512KB  18.7%  runtime.slicebytetostring
"""
    samples = parse_heap_text(text)
    assert len(samples) == 2
    assert samples[0].func == "runtime.mallocgc"
    assert samples[0].flat_space == int(1.23 * 1024 * 1024)
    assert samples[1].func == "runtime.slicebytetostring"
    assert samples[1].flat_space == 512 * 1024


if __name__ == "__main__":
    test_parse_pprof_text_basic()
    test_parse_pprof_text_millisecond()
    test_parse_pprof_text_empty()
    test_parse_pprof_csv_basic()
    test_parse_pprof_top_basic()
    test_parse_heap_text_inuse()
    test_parse_heap_text_alloc()
    test_parse_heap_csv_basic()
    test_parse_heap_top_basic()
    test_get_top_allocators()
    test_parse_heap_text_empty()
    print("ALL PASSED")
