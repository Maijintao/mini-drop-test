"""错误码 + ErrorInfo 结构体"""


# 错误码
ERR_OK = 0
ERR_STORAGE = 1       # 存储错误（MinIO 连接/下载/上传失败）
ERR_NOT_FOUND = 2     # 原始数据不存在
ERR_ANALYZER = 3      # 分析器执行错误（perf script/flamegraph.pl 失败）
ERR_CONFIG = 4        # 配置错误
ERR_APISERVER = 5     # apiserver 通信错误
ERR_UNSUPPORTED = 6   # 不支持的 task_type
ERR_IDEMPOTENT = 7    # 重复触发，跳过
ERR_ANALYSIS = 8      # 分析结果错误（解析失败、格式不合法等）


class ErrorInfo:
    """错误信息结构体，序列化为 JSON 写入 stderr"""

    def __init__(self, code: int, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail

    def to_dict(self) -> dict:
        d = {"code": self.code, "message": self.message}
        if self.detail:
            d["detail"] = self.detail
        return d
