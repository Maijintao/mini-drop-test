#!/bin/bash
# test_integration_e2e.sh
# 端到端集成测试：drop_server + drop_agent + Go 客户端模拟 apiserver
# 测试完整链路: apiserver→CreateTask → drop_server队列 → agent心跳拉取 → 采集 → NotifyResult → FetchData

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DROP_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_BIN="$DROP_DIR/build/drop_server"
AGENT_BIN="$DROP_DIR/build/drop_agent"
TEST_CLIENT="$SCRIPT_DIR/grpc_client/grpc_integration_test"
CONFIG_FILE="$DROP_DIR/etc/config.json"
SERVER_PORT=50151

SERVER_PID=""
AGENT_PID=""

cleanup() {
    echo ""
    echo "=== 清理 ==="
    if [ -n "$AGENT_PID" ]; then
        echo "  停止 drop_agent (PID=$AGENT_PID)"
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    if [ -n "$SERVER_PID" ]; then
        echo "  停止 drop_server (PID=$SERVER_PID)"
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    # 清理临时配置
    if [ -f "$SCRIPT_DIR/test_config.json" ]; then
        rm -f "$SCRIPT_DIR/test_config.json"
    fi
}
trap cleanup EXIT

PASS=0
FAIL=0

check() {
    local desc="$1"
    if eval "$2" >/dev/null 2>&1; then
        echo "  ✓ $desc"
        PASS=$((PASS+1))
    else
        echo "  ✗ $desc"
        FAIL=$((FAIL+1))
    fi
}

echo "=== 端到端集成测试 ==="
echo ""

# --- 前置检查 ---
echo "--- 前置检查 ---"

check "drop_server 已编译" "test -f '$SERVER_BIN'"
check "drop_agent 已编译" "test -f '$AGENT_BIN'"

# 编译 Go 测试客户端
if [ ! -f "$TEST_CLIENT" ]; then
    echo "  编译 Go 测试客户端..."
    cd "$SCRIPT_DIR/grpc_client"
    GOPROXY=https://goproxy.cn,direct go build -o grpc_integration_test . 2>&1
fi
check "Go 测试客户端就绪" "test -f '$TEST_CLIENT'"

echo ""

# --- 生成测试配置 ---
echo "--- 生成测试配置 ---"

cat > "$SCRIPT_DIR/test_config.json" << 'EOF'
{
  "uid": "e2e-test-agent",
  "ip_addr": "127.0.0.1",
  "server_ips": ["localhost"],
  "server_port": 50151,
  "storage": {
    "endpoint": "localhost:9000",
    "access_key": "drop",
    "secret_key": "dropdrop",
    "bucket": "drop",
    "use_ssl": false
  }
}
EOF
echo "✓ 测试配置已生成 (port=$SERVER_PORT)"
echo ""

# --- 启动 drop_server ---
echo "--- 启动 drop_server ---"

"$SERVER_BIN" --port "$SERVER_PORT" > /tmp/drop_server_e2e.log 2>&1 &
SERVER_PID=$!
sleep 2

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ drop_server 启动失败，查看日志:"
    cat /tmp/drop_server_e2e.log
    exit 1
fi
echo "✓ drop_server 已启动 (PID=$SERVER_PID)"
echo ""

# --- 启动 drop_agent ---
echo "--- 启动 drop_agent ---"

"$AGENT_BIN" --config "$SCRIPT_DIR/test_config.json" > /tmp/drop_agent_e2e.log 2>&1 &
AGENT_PID=$!
sleep 3

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "✗ drop_agent 启动失败，查看日志:"
    cat /tmp/drop_agent_e2e.log
    exit 1
fi
echo "✓ drop_agent 已启动 (PID=$AGENT_PID)"
echo ""

# 等待 Agent 完成注册和第一次心跳
echo "  等待 Agent 注册 + 心跳 (5 秒)..."
sleep 5
echo ""

# --- 运行端到端测试 ---
echo "--- 运行端到端测试 ---"
echo ""

"$TEST_CLIENT" "localhost:$SERVER_PORT"
TEST_EXIT=$?

echo ""

# --- 检查日志 ---
echo "--- 检查 server 日志 ---"

if [ -f /tmp/drop_server_e2e.log ]; then
    # 检查是否收到了心跳
    if grep -q "Heartbeat from" /tmp/drop_server_e2e.log; then
        echo "  ✓ server 日志包含心跳记录"
        PASS=$((PASS+1))
    else
        echo "  ✗ server 日志未见心跳"
        FAIL=$((FAIL+1))
    fi

    # 检查是否有任务派发
    if grep -q "Dispatching task" /tmp/drop_server_e2e.log; then
        echo "  ✓ server 日志包含任务派发记录"
        PASS=$((PASS+1))
    else
        echo "  ✗ server 日志未见任务派发"
        FAIL=$((FAIL+1))
    fi

    # 检查状态机迁移
    if grep -q "\[STATE\]" /tmp/drop_server_e2e.log; then
        echo "  ✓ server 日志包含状态迁移记录"
        PASS=$((PASS+1))
        echo "    状态迁移日志:"
        grep "\[STATE\]" /tmp/drop_server_e2e.log | head -10 | sed 's/^/      /'
    fi
fi

echo ""

echo "--- 检查 agent 日志 ---"

if [ -f /tmp/drop_agent_e2e.log ]; then
    # 检查是否成功注册
    if grep -qi "register\|config\|connected" /tmp/drop_agent_e2e.log; then
        echo "  ✓ agent 日志包含注册/连接记录"
        PASS=$((PASS+1))
    fi

    # 检查是否有任务接收
    if grep -qi "task\|profiler\|record" /tmp/drop_agent_e2e.log; then
        echo "  ✓ agent 日志包含任务处理记录"
        PASS=$((PASS+1))
    fi
fi

echo ""

# --- 结果 ---
echo "================================"
echo "通过: $PASS  失败: $FAIL  总计: $((PASS + FAIL))"

if [ "$TEST_EXIT" -eq 0 ] && [ "$FAIL" -eq 0 ]; then
    echo ""
    echo "🎉 端到端集成测试全部通过"
    echo ""
    echo "验证完成的链路:"
    echo "  apiserver(gRPC) → drop_server (CreateTask)"
    echo "  drop_server → drop_agent (心跳派发)"
    echo "  drop_agent → drop_server (NotifyResult)"
    echo "  apiserver(gRPC) → drop_server (FetchData/StatAgent)"
    exit 0
else
    echo ""
    echo "💥 端到端测试存在失败"
    echo ""
    echo "调试信息:"
    echo "  server 日志: /tmp/drop_server_e2e.log"
    echo "  agent 日志:  /tmp/drop_agent_e2e.log"
    exit 1
fi
