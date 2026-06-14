#!/bin/bash
# test_integration_grpc.sh
# 集成测试：启动 drop_server，用 Go 客户端模拟 apiserver 调用 gRPC 接口
# 测试 apiserver ↔ drop 互通能力

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DROP_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_BIN="$DROP_DIR/build/drop_server"
TEST_CLIENT="$SCRIPT_DIR/grpc_client/grpc_integration_test"
SERVER_PORT=50151
SERVER_PID=""

cleanup() {
    if [ -n "$SERVER_PID" ]; then
        echo "清理: 停止 drop_server (PID=$SERVER_PID)"
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

echo "=== 集成测试：apiserver ↔ drop_server gRPC 互通 ==="
echo ""

# --- 前置检查 ---
echo "--- 前置检查 ---"

if [ ! -f "$SERVER_BIN" ]; then
    echo "✗ drop_server 未编译，请先 cd drop/build && cmake .. && make"
    exit 1
fi
echo "✓ drop_server 存在"

# 编译 Go 测试客户端
if [ ! -f "$TEST_CLIENT" ]; then
    echo "  编译 Go 测试客户端..."
    cd "$SCRIPT_DIR/grpc_client"
    GOPROXY=https://goproxy.cn,direct go build -o grpc_integration_test . 2>&1
    if [ $? -ne 0 ]; then
        echo "✗ Go 测试客户端编译失败"
        exit 1
    fi
fi
echo "✓ Go 测试客户端就绪"

echo ""

# --- 启动 drop_server ---
echo "--- 启动 drop_server (port=$SERVER_PORT) ---"

"$SERVER_BIN" --port "$SERVER_PORT" &
SERVER_PID=$!
echo "  drop_server PID=$SERVER_PID"

# 等待 server 启动
sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ drop_server 启动失败"
    exit 1
fi
echo "✓ drop_server 已启动"
echo ""

# --- 运行集成测试 ---
echo "--- 运行 gRPC 集成测试 ---"
echo ""

"$TEST_CLIENT" "localhost:$SERVER_PORT"
TEST_EXIT=$?

echo ""

# --- 结果 ---
if [ "$TEST_EXIT" -eq 0 ]; then
    echo "🎉 apiserver ↔ drop_server 集成测试通过"
else
    echo "💥 集成测试存在失败，请检查上方日志"
fi

exit "$TEST_EXIT"
