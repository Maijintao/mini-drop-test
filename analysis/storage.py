"""对象存储客户端（MinIO）"""
import os
import time
import logging
from abc import ABC, abstractmethod
from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BASE_DELAY = 1  # seconds


def _retry(fn, *args, **kwargs):
    """带指数退避的重试包装器"""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except (S3Error, Exception) as e:
            last_exc = e
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning("Storage operation failed (attempt %d/%d): %s, retrying in %ds",
                               attempt + 1, MAX_RETRIES, e, delay)
                time.sleep(delay)
    raise last_exc


class Storage(ABC):
    """存储抽象基类"""

    @abstractmethod
    def download(self, key: str, local_path: str) -> str:
        """下载文件到本地"""

    @abstractmethod
    def upload(self, local_path: str, key: str) -> str:
        """上传本地文件"""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """检查对象是否存在"""


class MinIOStorage(Storage):
    """MinIO 存储客户端"""

    def __init__(self, endpoint: str, access_key: str, secret_key: str,
                 bucket: str, secure: bool = False):
        self.client = Minio(endpoint, access_key=access_key,
                            secret_key=secret_key, secure=secure)
        self.bucket = bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def download(self, key: str, local_path: str) -> str:
        """从 MinIO 下载文件到本地"""
        _retry(self.client.fget_object, self.bucket, key, local_path)
        return local_path

    def download_stream(self, key: str):
        """
        流式下载对象，返回 Response 对象。

        适用于大文件，避免一次性加载到内存。
        使用完毕后需关闭返回的 response（或用 with 语句）。

        Args:
            key: 对象 key

        Returns:
            urllib3.HTTPResponse，支持 .read() 和 .stream() 方法
        """
        return _retry(self.client.get_object, self.bucket, key)

    def upload(self, local_path: str, key: str) -> str:
        """上传本地文件到 MinIO"""
        _retry(self.client.fput_object, self.bucket, key, local_path)
        return key

    def exists(self, key: str) -> bool:
        """检查对象是否存在"""
        try:
            _retry(self.client.stat_object, self.bucket, key)
            return True
        except S3Error:
            return False
