"""对象存储客户端（MinIO）"""
import os
from minio import Minio
from minio.error import S3Error


class MinIOStorage:
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
        self.client.fget_object(self.bucket, key, local_path)
        return local_path

    def upload(self, local_path: str, key: str) -> str:
        """上传本地文件到 MinIO"""
        self.client.fput_object(self.bucket, key, local_path)
        return key

    def exists(self, key: str) -> bool:
        """检查对象是否存在"""
        try:
            self.client.stat_object(self.bucket, key)
            return True
        except S3Error:
            return False
