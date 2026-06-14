"""测试错误码与 ErrorInfo"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from error import (
    ErrorInfo, ERR_OK, ERR_STORAGE, ERR_NOT_FOUND,
    ERR_ANALYZER, ERR_CONFIG, ERR_APISERVER, ERR_UNSUPPORTED, ERR_IDEMPOTENT,
)


def test_error_codes_unique():
    """错误码不重复"""
    codes = [ERR_OK, ERR_STORAGE, ERR_NOT_FOUND, ERR_ANALYZER,
             ERR_CONFIG, ERR_APISERVER, ERR_UNSUPPORTED, ERR_IDEMPOTENT]
    assert len(codes) == len(set(codes))


def test_error_info_to_dict():
    """ErrorInfo 序列化"""
    info = ErrorInfo(ERR_STORAGE, "minio down", "connection refused")
    d = info.to_dict()
    assert d["code"] == ERR_STORAGE
    assert d["message"] == "minio down"
    assert d["detail"] == "connection refused"


def test_error_info_no_detail():
    """无 detail 时不包含该字段"""
    info = ErrorInfo(ERR_NOT_FOUND, "not found")
    d = info.to_dict()
    assert "detail" not in d


def test_error_info_json_serializable():
    """可序列化为 JSON"""
    info = ErrorInfo(ERR_ANALYZER, "perf failed", "exit code 1")
    s = json.dumps(info.to_dict())
    parsed = json.loads(s)
    assert parsed["code"] == ERR_ANALYZER


if __name__ == "__main__":
    test_error_codes_unique()
    test_error_info_to_dict()
    test_error_info_no_detail()
    test_error_info_json_serializable()
    print("ALL PASSED")
