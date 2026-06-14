#!/bin/bash
# 任务状态机测试
# 检查 PENDING → RUNNING → UPLOADING → DONE/FAILED 状态迁移

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

assert_eq() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        pass_count=$((pass_count + 1))
    else
        echo -e "  ${RED}✗${NC} $test_name (expected: $expected, actual: $actual)"
        fail_count=$((fail_count + 1))
    fi
}

echo "=========================================="
echo "  任务状态机测试"
echo "=========================================="
echo ""

HEADER="$PROJECT_DIR/server/HotmethodService.h"
IMPL="$PROJECT_DIR/server/HotmethodService.cpp"

# ============================================
# 状态枚举定义检查
# ============================================
echo "[状态枚举定义]"

assert_contains "TaskStatus 枚举定义" 'enum class TaskStatus' "$HEADER"
assert_contains "PENDING 状态" 'PENDING' "$HEADER"
assert_contains "DISPATCHED 状态" 'DISPATCHED' "$HEADER"
assert_contains "RUNNING 状态" 'RUNNING' "$HEADER"
assert_contains "UPLOADING 状态" 'UPLOADING' "$HEADER"
assert_contains "DONE 状态" 'DONE' "$HEADER"
assert_contains "FAILED 状态" 'FAILED' "$HEADER"
assert_contains "TIMEOUT 状态" 'TIMEOUT' "$HEADER"
echo ""

# ============================================
# TaskState 结构体检查
# ============================================
echo "[TaskState 结构体]"

assert_contains "TaskState 结构体定义" 'struct TaskState' "$HEADER"
assert_contains "status 字段" 'TaskStatus status' "$HEADER"
assert_contains "reason 字段" 'std::string reason' "$HEADER"
assert_contains "timestamp 字段" 'std::chrono.*timestamp' "$HEADER"
echo ""

# ============================================
# 状态跟踪数据结构检查
# ============================================
echo "[状态跟踪数据结构]"

assert_contains "tasks_state_ map" 'std::map.*tasks_state_' "$HEADER"
assert_contains "GetTaskStatus 方法" 'bool GetTaskStatus' "$HEADER"
assert_contains "UpdateTaskStatus 方法" 'void UpdateTaskStatus' "$HEADER"
echo ""

# ============================================
# 状态迁移点检查
# ============================================
echo "[状态迁移点]"

# PENDING：任务创建时
assert_contains "CreateTask → PENDING" 'TaskStatus::PENDING' "$IMPL"
assert_contains "PENDING reason" '任务创建' "$IMPL"

# RUNNING：任务派发时
assert_contains "PopTask → RUNNING" 'TaskStatus::RUNNING' "$IMPL"
assert_contains "RUNNING reason" '任务派发给 Agent' "$IMPL"

# DONE：采集成功时
assert_contains "NotifyResult → DONE" 'TaskStatus::DONE' "$IMPL"
assert_contains "DONE reason" '采集完成' "$IMPL"

# FAILED：采集失败时
assert_contains "NotifyResult → FAILED" 'TaskStatus::FAILED' "$IMPL"
assert_contains "FAILED reason" '采集失败' "$IMPL"
echo ""

# ============================================
# 状态迁移日志检查
# ============================================
echo "[状态迁移日志]"

assert_contains "UpdateTaskStatus 实现" 'HotmethodService::UpdateTaskStatus' "$IMPL"
assert_contains "更新 status 字段" 'state.status = status' "$IMPL"
assert_contains "更新 reason 字段" 'state.reason = reason' "$IMPL"
assert_contains "更新 timestamp" 'state.timestamp' "$IMPL"
assert_contains "状态迁移日志输出" '\[STATE\]' "$IMPL"
assert_contains "PENDING 日志" 'PENDING' "$IMPL"
assert_contains "RUNNING 日志" 'RUNNING' "$IMPL"
assert_contains "DONE 日志" 'DONE' "$IMPL"
assert_contains "FAILED 日志" 'FAILED' "$IMPL"
echo ""

# ============================================
# 状态查询接口检查
# ============================================
echo "[状态查询接口]"

assert_contains "GetTaskStatus 实现" 'HotmethodService::GetTaskStatus' "$IMPL"
assert_contains "查找任务状态" 'tasks_state_.find(task_id)' "$IMPL"
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
