#!/bin/bash
# Server 任务队列测试
# 检查 HotmethodService 的任务队列实现是否符合复刻指南

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

assert_not_contains() {
    local test_name="$1"
    local pattern="$2"
    local file="$3"
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        pass_count=$((pass_count + 1))
    else
        echo -e "  ${RED}✗${NC} $test_name ('$pattern' found but should not)"
        fail_count=$((fail_count + 1))
    fi
}

echo "=========================================="
echo "  Server 任务队列测试"
echo "=========================================="
echo ""

HEADER="$PROJECT_DIR/server/HotmethodService.h"
IMPL="$PROJECT_DIR/server/HotmethodService.cpp"

# ============================================
# 数据结构检查
# ============================================
echo "[数据结构]"

assert_contains "使用 map 存储任务队列" 'std::map.*tasks_' "$HEADER"
assert_contains "使用 deque 作为队列" 'std::deque.*TaskDesc' "$HEADER"
assert_contains "使用 mutex 保护" 'std::mutex' "$HEADER"
assert_contains "定义队列大小限制" 'MAX_TASK_QUEUE_SIZE' "$HEADER"
assert_contains "存储任务结果" 'std::map.*results_' "$HEADER"
assert_contains "存储 Agent 状态" 'std::map.*agents_' "$HEADER"
assert_contains "AgentStatus 结构体" 'struct AgentStatus' "$HEADER"
assert_contains "AgentStatus.last_heartbeat" 'last_heartbeat' "$HEADER"
echo ""

# ============================================
# PushTask 方法检查
# ============================================
echo "[PushTask 方法]"

assert_contains "PushTask 方法声明" 'bool PushTask' "$HEADER"
assert_contains "PushTask 实现" 'bool HotmethodService::PushTask' "$IMPL"
assert_contains "加锁保护" 'std::lock_guard<std::mutex>' "$IMPL"
assert_contains "检查队列满" 'queue.size() >= MAX_TASK_QUEUE_SIZE' "$IMPL"
assert_contains "队列满返回 false" 'return false' "$IMPL"
assert_contains "正常入队" 'queue.push_back(task)' "$IMPL"
echo ""

# ============================================
# PopTask 方法检查
# ============================================
echo "[PopTask 方法]"

assert_contains "PopTask 方法声明" 'bool PopTask' "$HEADER"
assert_contains "PopTask 实现" 'bool HotmethodService::PopTask' "$IMPL"
assert_contains "检查队列非空" 'it->second.empty()' "$IMPL"
assert_contains "取出队首" 'it->second.front()' "$IMPL"
assert_contains "弹出队首" 'it->second.pop_front()' "$IMPL"
assert_contains "清理空队列" 'tasks_.erase(it)' "$IMPL"
echo ""

# ============================================
# GetResult 方法检查
# ============================================
echo "[GetResult 方法]"

assert_contains "GetResult 方法声明" 'bool GetResult' "$HEADER"
assert_contains "GetResult 实现" 'bool HotmethodService::GetResult' "$IMPL"
assert_contains "查找结果" 'results_.find(task_id)' "$IMPL"
echo ""

# ============================================
# NotifyResult 方法检查
# ============================================
echo "[NotifyResult 方法]"

assert_contains "NotifyResult 方法声明" 'grpc::Status NotifyResult' "$HEADER"
assert_contains "NotifyResult 实现" 'HotmethodService::NotifyResult' "$IMPL"
assert_contains "缓存结果" 'results_\[task_id\]' "$IMPL"
echo ""

# ============================================
# Agent 状态管理检查
# ============================================
echo "[Agent 状态管理]"

assert_contains "UpdateAgentStatus 声明" 'void UpdateAgentStatus' "$HEADER"
assert_contains "GetAgentStatus 声明" 'bool GetAgentStatus' "$HEADER"
assert_contains "UpdateAgentStatus 实现" 'HotmethodService::UpdateAgentStatus' "$IMPL"
assert_contains "GetAgentStatus 实现" 'HotmethodService::GetAgentStatus' "$IMPL"
assert_contains "更新心跳时间" 'last_heartbeat = std::chrono::steady_clock::now()' "$IMPL"
echo ""

# ============================================
# 线程安全检查
# ============================================
echo "[线程安全]"

# 检查所有公开方法都加锁
LOCK_COUNT=$(grep -c 'std::lock_guard<std::mutex>' "$IMPL" || true)
if [ "$LOCK_COUNT" -ge 4 ]; then
    echo -e "  ${GREEN}✓${NC} 所有关键方法都有锁保护 ($LOCK_COUNT 处)"
    pass_count=$((pass_count + 1))
else
    echo -e "  ${RED}✗${NC} 锁保护不足 ($LOCK_COUNT 处，至少需要 4 处)"
    fail_count=$((fail_count + 1))
fi
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
