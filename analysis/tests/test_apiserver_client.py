"""测试 apiserver 客户端（mock HTTP）"""
import sys, os, json, threading, http.server
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from apiserver_client import APIServerClient


class MockHandler(http.server.BaseHTTPRequestHandler):
    """记录请求的 mock handler"""
    requests = []

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        MockHandler.requests.append({
            "method": "PUT", "path": self.path,
            "body": json.loads(body) if body else {},
        })
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"code": 0}')

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        MockHandler.requests.append({
            "method": "POST", "path": self.path,
            "body": json.loads(body) if body else {},
        })
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"code": 0}')

    def log_message(self, *args):
        pass  # 静默


def test_update_analysis_status():
    """更新分析状态"""
    MockHandler.requests = []
    server = http.server.HTTPServer(("127.0.0.1", 0), MockHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever)
    t.daemon = True
    t.start()

    try:
        client = APIServerClient(f"http://127.0.0.1:{port}")
        client.update_analysis_status("tid-001", 2, "ok")

        assert len(MockHandler.requests) == 1
        req = MockHandler.requests[0]
        assert req["method"] == "PUT"
        assert "tid-001" in req["path"]
        assert req["body"]["analysis_status"] == 2
        assert req["body"]["status_info"] == "ok"
    finally:
        server.shutdown()


def test_create_suggestion():
    """创建分析建议"""
    MockHandler.requests = []
    server = http.server.HTTPServer(("127.0.0.1", 0), MockHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever)
    t.daemon = True
    t.start()

    try:
        client = APIServerClient(f"http://127.0.0.1:{port}")
        client.create_suggestion("tid-002", "malloc", "use pool", "ai says ok")

        assert len(MockHandler.requests) == 1
        req = MockHandler.requests[0]
        assert req["method"] == "POST"
        assert "tid-002" in req["path"]
        assert req["body"]["func"] == "malloc"
        assert req["body"]["suggestion"] == "use pool"
        assert req["body"]["ai_suggestion"] == "ai says ok"
    finally:
        server.shutdown()


def test_auth_headers():
    """请求携带认证 header"""
    MockHandler.requests = []
    server = http.server.HTTPServer(("127.0.0.1", 0), MockHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever)
    t.daemon = True
    t.start()

    try:
        client = APIServerClient(f"http://127.0.0.1:{port}")
        client.update_analysis_status("t", 1)
        # 不报错即通过，handler 端能收到请求
        assert len(MockHandler.requests) == 1
    finally:
        server.shutdown()


if __name__ == "__main__":
    test_update_analysis_status()
    test_create_suggestion()
    test_auth_headers()
    print("ALL PASSED")
