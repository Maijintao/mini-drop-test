"""测试配置加载"""
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Config


def test_config_defaults():
    """无配置文件时使用默认值"""
    cfg = Config("")
    assert cfg.minio_endpoint == "localhost:9000"
    assert cfg.minio_access_key == "minioadmin"
    assert cfg.apiserver_url == "http://localhost:8191"


def test_config_from_file():
    """从 INI 文件加载配置"""
    d = tempfile.mkdtemp()
    ini = os.path.join(d, "test.ini")
    with open(ini, "w") as f:
        f.write("""[minio]
endpoint = minio.example.com:9000
access_key = mykey
secret_key = mysecret
bucket = mybucket
secure = true

[apiserver]
url = http://api.example.com:8080
""")
    cfg = Config(ini)
    assert cfg.minio_endpoint == "minio.example.com:9000"
    assert cfg.minio_access_key == "mykey"
    assert cfg.minio_bucket == "mybucket"
    assert cfg.minio_secure is True
    assert cfg.apiserver_url == "http://api.example.com:8080"

    os.unlink(ini)
    os.rmdir(d)


def test_config_partial_file():
    """部分配置文件，其余用默认值"""
    d = tempfile.mkdtemp()
    ini = os.path.join(d, "test.ini")
    with open(ini, "w") as f:
        f.write("[minio]\nendpoint = custom:9000\n")
    cfg = Config(ini)
    assert cfg.minio_endpoint == "custom:9000"
    assert cfg.minio_access_key == "minioadmin"  # 默认值

    os.unlink(ini)
    os.rmdir(d)


def test_empty_file_values_do_not_override_environment():
    """空配置项不覆盖环境变量"""
    d = tempfile.mkdtemp()
    ini = os.path.join(d, "test.ini")
    old_access = os.environ.get("MINIO_ACCESS_KEY")
    old_secret = os.environ.get("MINIO_SECRET_KEY")
    os.environ["MINIO_ACCESS_KEY"] = "env-ak"
    os.environ["MINIO_SECRET_KEY"] = "env-sk"
    try:
        with open(ini, "w") as f:
            f.write("[minio]\naccess_key =\nsecret_key =\n")
        cfg = Config(ini)
        assert cfg.minio_access_key == "env-ak"
        assert cfg.minio_secret_key == "env-sk"
    finally:
        if old_access is None:
            os.environ.pop("MINIO_ACCESS_KEY", None)
        else:
            os.environ["MINIO_ACCESS_KEY"] = old_access
        if old_secret is None:
            os.environ.pop("MINIO_SECRET_KEY", None)
        else:
            os.environ["MINIO_SECRET_KEY"] = old_secret
        os.unlink(ini)
        os.rmdir(d)


if __name__ == "__main__":
    test_config_defaults()
    test_config_from_file()
    test_config_partial_file()
    test_empty_file_values_do_not_override_environment()
    print("ALL PASSED")
