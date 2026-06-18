"""配置加载模块"""
import configparser
import os


class Config:
    """分析引擎配置"""

    def __init__(self, config_path: str = ""):
        self.cfg = configparser.ConfigParser()

        # 默认值（环境变量优先，适配 Docker 部署）
        self.minio_endpoint = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
        self.minio_access_key = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
        self.minio_secret_key = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
        self.minio_bucket = os.environ.get("MINIO_BUCKET", "drop-data")
        self.minio_secure = os.environ.get("MINIO_SECURE", "false").lower() == "true"

        self.apiserver_url = os.environ.get("APISERVER_URL", "http://localhost:8191")

        if config_path and os.path.exists(config_path):
            self._load(config_path)

    def _load(self, path: str):
        self.cfg.read(path)

        if self.cfg.has_section("minio"):
            self.minio_endpoint = self._get_non_empty("minio", "endpoint", self.minio_endpoint)
            self.minio_access_key = self._get_non_empty("minio", "access_key", self.minio_access_key)
            self.minio_secret_key = self._get_non_empty("minio", "secret_key", self.minio_secret_key)
            self.minio_bucket = self._get_non_empty("minio", "bucket", self.minio_bucket)
            self.minio_secure = self.cfg.getboolean("minio", "secure", fallback=self.minio_secure)

        if self.cfg.has_section("apiserver"):
            self.apiserver_url = self._get_non_empty("apiserver", "url", self.apiserver_url)

    def _get_non_empty(self, section: str, option: str, fallback: str) -> str:
        value = self.cfg.get(section, option, fallback=fallback)
        value = value.strip() if isinstance(value, str) else value
        return value or fallback
