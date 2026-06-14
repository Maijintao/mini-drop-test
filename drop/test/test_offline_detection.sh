#!/bin/bash
# 离线检测和审计日志测试
# 检查 30s 无心跳判离线、离线/恢复审计日志

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
        pass_count=$((pass_count + 1))
    else
        echo -e "  ${RED}✗${NC} $test_name ('$pattern' not found)"
        fail_count=$((fail_count + 1))
    fi
}

echo "=========================================="
echo "  离线检测和审计日志测试"
echo "=========================================="
echo ""

HEADER="$PROJECT_DIR/server/HotmethodService.h"
IMPL="$PROJECT_DIR/server/HotmethodService.cpp"

# ============================================
# AgentStatus 结构体检查
# ============================================
echo "[AgentStatus 结构体]"

assert_contains "online 字段" 'bool online' "$HEADER"
assert_contains "last_heartbeat 字段" 'last_heartbeat' "$HEADER"
echo ""

# ============================================
# 离线检测逻辑检查
# ============================================
echo "[离线检测逻辑]"

assert_contains "IsAgentOnline 方法声明" 'bool IsAgentOnline' "$HEADER"
assert_contains "IsAgentOnline 实现" 'HotmethodService::IsAgentOnline' "$IMPL"
assert_contains "30s 超时判断" 'elapsed > 30' "$IMPL"
assert_contains "标记离线" 'online = false' "$IMPL"
echo ""

# ============================================
# GetAgentStatus 中的离线检测
# ============================================
echo "[GetAgentStatus 离线检测]"

assert_contains "GetAgentStatus 实现" 'HotmethodService::GetAgentStatus' "$IMPL"
assert_contains "检查心跳时间" 'elapsed' "$IMPL"
assert_contains "超时标记离线" 'online = false' "$IMPL"
echo ""

# ============================================
# 审计日志检查
# ============================================
echo "[审计日志]"

assert_contains "AUDIT 标记" '\[AUDIT\]' "$IMPL"
assert_contains "恢复上线日志" '恢复上线' "$IMPL"
assert_contains "离线日志" '离线' "$IMPL"
assert_contains "无心跳时间" '无心跳' "$IMPL"
echo ""

# ============================================
# UpdateAgentStatus 中的恢复检测
# ============================================
echo "[恢复检测]"

assert_contains "UpdateAgentStatus 实现" 'HotmethodService::UpdateAgentStatus' "$IMPL"
assert_contains "检测之前状态" 'was_online' "$IMPL"
assert_contains "恢复上线审计" '恢复上线' "$IMPL"
echo ""

# ============================================
# 心跳频率检查 (文档要求 1Hz)
# ============================================
echo "[心跳频率]"

HEARTBEAT="$PROJECT_DIR/agent/HealthCheckChannel.cpp"

assert_contains "100ms 分段 sleep" 'milliseconds(100)' "$HEARTBEAT"
assert_contains "10 次循环 (1Hz)" 'i < 10' "$HEARTBEAT"
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
