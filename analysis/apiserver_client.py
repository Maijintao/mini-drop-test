"""
APIServer HTTP 客户端

用于分析完成后回写状态和建议到 apiserver。
"""
import json
import urllib.request
import urllib.error


class APIServerClient:
    """apiserver HTTP 客户端"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _request(self, method: str, path: str, data: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Drop_user_uid", "analysis-system")
        req.add_header("Drop_user_name", "analysis-system")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"apiserver {method} {path} failed ({e.code}): {body}")

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
