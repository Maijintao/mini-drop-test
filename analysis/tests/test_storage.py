"""测试存储客户端"""
import sys, os, tempfile, shutil
from unittest.mock import MagicMock, patch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from storage import MinIOStorage


def test_storage_init_fails_without_server():
    """连不上 MinIO 时抛异常"""
    try:
        MinIOStorage("localhost:19999", "x", "y", "bucket")
        assert False, "应该抛异常"
    except Exception:
        pass  # 预期


@patch("storage.Minio")
def test_download(mock_minio_cls):
    """下载文件"""
    mock_client = MagicMock()
    mock_minio_cls.return_value = mock_client
    mock_client.bucket_exists.return_value = True

    store = MinIOStorage("localhost:9000", "k", "s", "b")

    d = tempfile.mkdtemp()
    try:
        local = os.path.join(d, "test.txt")
        store.download("remote/key.txt", local)
        mock_client.fget_object.assert_called_once_with("b", "remote/key.txt", local)
    finally:
        shutil.rmtree(d)


@patch("storage.Minio")
def test_upload(mock_minio_cls):
    """上传文件"""
    mock_client = MagicMock()
    mock_minio_cls.return_value = mock_client
    mock_client.bucket_exists.return_value = True

    store = MinIOStorage("localhost:9000", "k", "s", "b")

    d = tempfile.mkdtemp()
    try:
        local = os.path.join(d, "test.txt")
        with open(local, "w") as f:
            f.write("hello")
        store.upload(local, "remote/key.txt")
        mock_client.fput_object.assert_called_once_with("b", "remote/key.txt", local)
    finally:
        shutil.rmtree(d)


@patch("storage.Minio")
def test_exists_true(mock_minio_cls):
    """对象存在"""
    mock_client = MagicMock()
    mock_minio_cls.return_value = mock_client
    mock_client.bucket_exists.return_value = True

    store = MinIOStorage("localhost:9000", "k", "s", "b")
    assert store.exists("some/key") is True


@patch("storage.Minio")
def test_exists_false(mock_minio_cls):
    """对象不存在"""
    from minio.error import S3Error
    mock_client = MagicMock()
    mock_minio_cls.return_value = mock_client
    mock_client.bucket_exists.return_value = True
    mock_client.stat_object.side_effect = S3Error("not found", None, None, None, None, None)

    store = MinIOStorage("localhost:9000", "k", "s", "b")
    assert store.exists("missing/key") is False


@patch("storage.Minio")
def test_ensure_bucket_creates(mock_minio_cls):
    """bucket 不存在时自动创建"""
    mock_client = MagicMock()
    mock_minio_cls.return_value = mock_client
    mock_client.bucket_exists.return_value = False

    MinIOStorage("localhost:9000", "k", "s", "newbucket")
    mock_client.make_bucket.assert_called_once_with("newbucket")


if __name__ == "__main__":
    test_storage_init_fails_without_server()
    test_download()
    test_upload()
    test_exists_true()
    test_exists_false()
    test_ensure_bucket_creates()
    print("ALL PASSED")
