"""
APIServer HTTP 客户端

用于分析完成后回写状态和建议到 apiserver。
"""
import json
import logging
import os
import time
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BASE_DELAY = 1  # seconds


class APIServerClient:
    """apiserver HTTP 客户端"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.uid = os.environ.get("DROP_USER_UID", "analysis-system")
        self.user_name = os.environ.get("DROP_USER_NAME", self.uid)
        self.token = os.environ.get("DROP_USER_TOKEN", "")

    def _request(self, method: str, path: str, data: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Drop_user_uid", self.uid)
        req.add_header("Drop_user_name", self.user_name)
        if self.token:
            req.add_header("Drop_user_token", self.token)

        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                resp_body = e.read().decode("utf-8", errors="replace")
                # 4xx 客户端错误不重试
                if 400 <= e.code < 500:
                    raise RuntimeError(f"apiserver {method} {path} failed ({e.code}): {resp_body}")
                last_exc = RuntimeError(f"apiserver {method} {path} failed ({e.code}): {resp_body}")
            except Exception as e:
                last_exc = e

            if attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning("apiserver %s %s failed (attempt %d/%d): %s, retrying in %ds",
                               method, path, attempt + 1, MAX_RETRIES, last_exc, delay)
                time.sleep(delay)

        raise last_exc

    def update_analysis_status(self, tid: str, status: int, status_info: str = ""):
        """更新任务分析状态"""
        self._request("PUT", f"/api/v1/tasks/{tid}/analysis_status", {
            "analysis_status": status,
            "status_info": status_info,
        })

    def create_suggestion(self, tid: str, func: str, suggestion: str,
                          ai_suggestion: str = ""):
        """写入分析建议"""
        self._request("POST", f"/api/v1/tasks/{tid}/suggestions", {
            "func": func,
            "suggestion": suggestion,
            "ai_suggestion": ai_suggestion,
        })
