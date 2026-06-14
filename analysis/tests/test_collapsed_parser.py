"""测试折叠栈解析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_parser.collapsed_parser import parse_perf_script, parse_collapsed, stacks_to_collapsed


def test_parse_collapsed_basic():
    """基本折叠栈解析"""
    data = "func_a;func_b;func_c 100\nfunc_a;func_b 200\n"
    stacks = parse_collapsed(data)
    assert stacks == {"func_a;func_b;func_c": 100, "func_a;func_b": 200}


def test_parse_collapsed_empty():
    """空输入"""
    assert parse_collapsed("") == {}
    assert parse_collapsed("\n") == {}


def test_parse_collapsed_invalid_lines():
    """无效行跳过"""
    data = "valid_stack 100\nno_count\nalso_valid 50\n"
    stacks = parse_collapsed(data)
    assert stacks == {"valid_stack": 100, "also_valid": 50}


def test_stacks_to_collapsed_roundtrip():
    """折叠栈序列化往返"""
    original = {"a;b;c": 300, "a;b": 100, "x;y": 200}
    text = stacks_to_collapsed(original)
    parsed = parse_collapsed(text)
    assert parsed == original


def test_parse_perf_script_basic():
    """解析 perf script 基本格式"""
    script = """comm1 1234 [000] 1000.000: cpu-cycles:
    ffffffff81234567 func_a+0x17 ([kernel.kallsyms])
    ffffffff81234568 func_b+0x2a ([kernel.kallsyms])

comm2 5678 [001] 1000.001: cpu-cycles:
    00007f1234567890 func_c+0x30 (/usr/lib/lib.so)
    00007f1234567891 func_d+0x50 (/usr/lib/lib.so)

"""
    stacks = parse_perf_script(script)
    assert len(stacks) == 2
    # 验证栈内容
    keys = list(stacks.keys())
    assert any("func_a" in k and "func_b" in k for k in keys)
    assert any("func_c" in k and "func_d" in k for k in keys)


def test_parse_perf_script_dedup_frames():
    """相同栈合并计数"""
    script = """p 1 [000] 1.0: e:
    ffffffff a+0x1 (k)
    ffffffff b+0x2 (k)

p 1 [000] 2.0: e:
    ffffffff a+0x1 (k)
    ffffffff b+0x2 (k)

"""
    stacks = parse_perf_script(script)
    # 同一个栈应该合并为 count=2
    assert len(stacks) == 1
    assert list(stacks.values())[0] == 2


def test_parse_perf_script_strips_offset():
    """去掉 +0x 偏移"""
    script = """p 1 [000] 1.0: e:
    ffffffff func_x+0xdead (k)

"""
    stacks = parse_perf_script(script)
    key = list(stacks.keys())[0]
    assert "+0x" not in key
    assert "func_x" in key


if __name__ == "__main__":
    test_parse_collapsed_basic()
    test_parse_collapsed_empty()
    test_parse_collapsed_invalid_lines()
    test_stacks_to_collapsed_roundtrip()
    test_parse_perf_script_basic()
    test_parse_perf_script_dedup_frames()
    test_parse_perf_script_strips_offset()
    print("ALL PASSED")
