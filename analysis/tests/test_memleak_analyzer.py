"""测试内存泄漏分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.memleak_analyzer import analyze_memleak, validate_task_type


def test_task_type_4_returns_error():
    """task_type=4 直接返回错误"""
    result = analyze_memleak("/tmp/fake.data")
    assert result.success is False
    assert "not supported" in result.error
    assert "Valgrind" in result.detail or "ASan" in result.detail


def test_validate_task_type_4():
    """验证 task_type=4 不支持"""
    msg = validate_task_type(4)
    assert msg is not None
    assert "not supported" in msg


def test_validate_task_type_0():
    """验证 task_type=0 支持"""
    msg = validate_task_type(0)
    assert msg is None


if __name__ == "__main__":
    test_task_type_4_returns_error()
    test_validate_task_type_4()
    test_validate_task_type_0()
    print("ALL PASSED")
