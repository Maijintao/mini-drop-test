"""测试分析建议 Markdown 解析"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from suggestion_parser import parse_suggestions_markdown


def test_parse_cpu_rule_suggestions():
    content = """# 分析建议 [tid]

## 1. `malloc`
- Self 采样: 10
- Inclusive 采样: 20
- 建议: 考虑使用对象池
"""
    assert parse_suggestions_markdown(content) == [
        {"func": "malloc", "suggestion": "考虑使用对象池"}
    ]


def test_parse_memleak_suggestions():
    content = """# 内存泄漏分析 - tid

### 1. allocate_buffer (heap, 1024 bytes)
**建议**: 检查释放路径
"""
    assert parse_suggestions_markdown(content) == [
        {"func": "allocate_buffer", "suggestion": "检查释放路径"}
    ]


if __name__ == "__main__":
    test_parse_cpu_rule_suggestions()
    test_parse_memleak_suggestions()
    print("ALL PASSED")
