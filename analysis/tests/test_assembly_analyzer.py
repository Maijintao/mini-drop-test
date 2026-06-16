"""测试汇编代码分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.assembly_code_analyzer import parse_objdump, stats_to_json


X86_DUMP = """/tmp/test:     file format elf64-x86-64

Disassembly of section .text:

00000000004005b0 <main>:
  4005b0:\t55                    \tpush   %rbp
  4005b1:\t48 89 e5              \tmov    %rsp,%rbp
  4005b4:\t48 83 ec 10           \tsub    $0x10,%rsp
  4005b8:\tbf 01 00 00 00        \tmov    $0x1,%edi
  4005bd:\te8 0e 00 00 00        \tcallq  4005d0 <write>
  4005c2:\t89 45 fc              \tmov    %eax,-0x4(%rbp)
  4005c5:\tb8 00 00 00 00        \tmov    $0x0,%eax
  4005ca:\tc3                    \tretq

00000000004005d0 <write>:
  4005d0:\t55                    \tpush   %rbp
  4005d1:\t48 89 e5              \tmov    %rsp,%rbp
  4005d4:\tc3                    \tretq
"""


def test_parse_x86_basic():
    """解析 x86_64 汇编"""
    stats = parse_objdump(X86_DUMP)
    assert stats.arch == "x86_64"
    assert stats.total_functions == 2
    assert stats.total_instructions == 11
    assert len(stats.functions) == 2


def test_parse_function_names():
    """函数名解析"""
    stats = parse_objdump(X86_DUMP)
    names = [f.name for f in stats.functions]
    assert "main" in names
    assert "write" in names


def test_parse_call_detection():
    """call 指令检测"""
    stats = parse_objdump(X86_DUMP)
    main_func = next(f for f in stats.functions if f.name == "main")
    assert main_func.call_count == 1


def test_parse_memory_access():
    """内存访问检测"""
    stats = parse_objdump(X86_DUMP)
    main_func = next(f for f in stats.functions if f.name == "main")
    assert main_func.memory_access_count > 0


def test_stats_to_json():
    """JSON 序列化"""
    stats = parse_objdump(X86_DUMP)
    json_str = stats_to_json(stats)
    import json
    data = json.loads(json_str)
    assert data["arch"] == "x86_64"
    assert data["total_functions"] == 2


def test_empty_input():
    """空输入"""
    stats = parse_objdump("")
    assert stats.total_functions == 0


if __name__ == "__main__":
    test_parse_x86_basic()
    test_parse_function_names()
    test_parse_call_detection()
    test_parse_memory_access()
    test_stats_to_json()
    test_empty_input()
    print("ALL PASSED")
