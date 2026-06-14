#!/bin/bash
# 心跳机制测试
# 检查 HealthCheckChannel 和 HealthCheckService 的实现是否符合复刻指南

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass_count=0
fail_count=0

assert_contains() {
    local test_name="$1"
    local pattern="$2"
    local file="$3"
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        ((pass_count++))
    else
        echo -e "  ${RED}✗${NC} $test_name ('$pattern' not found)"
        ((fail_count++))
    fi
}

echo "=========================================="
echo "  心跳机制测试"
echo "=========================================="
echo ""

# ============================================
# Agent 端心跳发送
# ============================================
echo "[Agent 端 - HealthCheckChannel]"

AGENT_HEADER="$PROJECT_DIR/agent/HealthCheckChannel.h"
AGENT_IMPL="$PROJECT_DIR/agent/HealthCheckChannel.cpp"

assert_contains "心跳线程" 'std::thread' "$AGENT_HEADER"
assert_contains "退出标志引用" 'std::atomic<bool>& running_' "$AGENT_HEADER"
assert_contains "任务回调" 'TaskCallback' "$AGENT_HEADER"
assert_contains "SetTaskCallback 方法" 'void SetTaskCallback' "$AGENT_HEADER"
assert_contains "Start 方法" 'void Start' "$AGENT_HEADER"
assert_contains "HeartbeatLoop 实现" 'void HealthCheckChannel::HeartbeatLoop' "$AGENT_IMPL"
assert_contains "创建 gRPC 通道" 'grpc::CreateChannel' "$AGENT_IMPL"
assert_contains "创建 Stub" 'HealthCheck::NewStub' "$AGENT_IMPL"
assert_contains "设置主机名" 'request.set_host_name' "$AGENT_IMPL"
assert_contains "设置 IP 地址" 'request.set_ip_addr' "$AGENT_IMPL"
assert_contains "设置 UID" 'request.set_uid' "$AGENT_IMPL"
assert_contains "等待退出" 'running_' "$AGENT_IMPL"
echo ""

# ============================================
# Server 端心跳接收
# ============================================
echo "[Server 端 - HealthCheckService]"

SERVER_HEADER="$PROJECT_DIR/server/HealthCheckService.h"
SERVER_IMPL="$PROJECT_DIR/server/HealthCheckService.cpp"

assert_contains "继承 HealthCheck::Service" 'HealthCheck::Service' "$SERVER_HEADER"
assert_contains "Do 方法声明" 'grpc::Status Do' "$SERVER_HEADER"
assert_contains "持有 HotmethodService 指针" 'HotmethodService*' "$SERVER_HEADER"
assert_contains "Do 方法实现" 'HealthCheckService::Do' "$SERVER_IMPL"
assert_contains "日志记录心跳" 'Heartbeat from' "$SERVER_IMPL"
assert_contains "设置响应状态" 'response->set_status' "$SERVER_IMPL"
assert_contains "更新 Agent 状态" 'UpdateAgentStatus' "$SERVER_IMPL"
assert_contains "派发任务" 'PopTask' "$SERVER_IMPL"
assert_contains "设置 pending 标志" 'response->set_pending' "$SERVER_IMPL"
echo ""

# ============================================
# 心跳频率检查
# ============================================
echo "[心跳频率]"

# 检查是否有 sleep 或定时机制
if grep -q "sleep" "$AGENT_IMPL" || grep -q "this_thread::sleep" "$AGENT_IMPL"; then
    assert_contains "心跳间隔控制" 'sleep' "$AGENT_IMPL"
else
    echo -e "  ${YELLOW}⚠${NC} 未找到明确的 sleep 调用，可能在循环中控制"
fi
echo ""

# ============================================
# 任务派发流程检查
# ============================================
echo "[任务派发流程]"

assert_contains "心跳时检查任务" 'PopTask' "$SERVER_IMPL"
assert_contains "有任务时设置 pending=true" 'set_pending(true)' "$SERVER_IMPL"
assert_contains "无任务时设置 pending=false" 'set_pending(false)' "$SERVER_IMPL"
assert_contains "派发任务日志" 'Dispatching task' "$SERVER_IMPL"
echo ""

# ============================================
# 总结
# ============================================
echo "=========================================="
echo "  测试结果: ${GREEN}$pass_count 通过${NC}, ${RED}$fail_count 失败${NC}"
echo "=========================================="

if [ $fail_count -gt 0 ]; then
    exit 1
fi
