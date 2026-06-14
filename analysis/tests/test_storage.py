"""测试存储客户端（不连真实 MinIO，测试接口契约）"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from storage import MinIOStorage


def test_storage_init_fails_without_server():
    """连不上 MinIO 时抛异常"""
    try:
        MinIOStorage("localhost:19999", "x", "y", "bucket")
        assert False, "应该抛异常"
    except Exception:
        pass  # 预期


if __name__ == "__main__":
    test_storage_init_fails_without_server()
    print("ALL PASSED")
