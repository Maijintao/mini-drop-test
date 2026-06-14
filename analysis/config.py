"""配置加载模块"""
import configparser
import os


class Config:
    """分析引擎配置"""

    def __init__(self, config_path: str = ""):
        self.cfg = configparser.ConfigParser()

        # 默认值
        self.minio_endpoint = "localhost:9000"
        self.minio_access_key = "minioadmin"
        self.minio_secret_key = "minioadmin"
        self.minio_bucket = "drop-data"
        self.minio_secure = False

        self.pg_host = "localhost"
        self.pg_port = 5432
        self.pg_user = "postgres"
        self.pg_password = "dev"
        self.pg_dbname = "drop"

        self.apiserver_url = "http://localhost:8191"

        if config_path and os.path.exists(config_path):
            self._load(config_path)

    def _load(self, path: str):
        self.cfg.read(path)

        if self.cfg.has_section("minio"):
            self.minio_endpoint = self.cfg.get("minio", "endpoint", fallback=self.minio_endpoint)
            self.minio_access_key = self.cfg.get("minio", "access_key", fallback=self.minio_access_key)
            self.minio_secret_key = self.cfg.get("minio", "secret_key", fallback=self.minio_secret_key)
            self.minio_bucket = self.cfg.get("minio", "bucket", fallback=self.minio_bucket)
            self.minio_secure = self.cfg.getboolean("minio", "secure", fallback=self.minio_secure)

        if self.cfg.has_section("postgres"):
            self.pg_host = self.cfg.get("postgres", "host", fallback=self.pg_host)
            self.pg_port = self.cfg.getint("postgres", "port", fallback=self.pg_port)
            self.pg_user = self.cfg.get("postgres", "user", fallback=self.pg_user)
            self.pg_password = self.cfg.get("postgres", "password", fallback=self.pg_password)
            self.pg_dbname = self.cfg.get("postgres", "dbname", fallback=self.pg_dbname)

        if self.cfg.has_section("apiserver"):
            self.apiserver_url = self.cfg.get("apiserver", "url", fallback=self.apiserver_url)
