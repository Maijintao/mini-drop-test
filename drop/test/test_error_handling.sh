#!/bin/bash
# 错误处理测试
# 检查显式错误处理是否符合题目要求

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
echo "  错误处理测试"
echo "=========================================="
echo ""

# ============================================
# ControlService 参数校验
# ============================================
echo "[ControlService 参数校验]"

CONTROL="$PROJECT_DIR/server/ControlService.cpp"

assert_contains "CreateTask target_ip 校验" 'target_ip.*empty' "$CONTROL"
assert_contains "CreateTask task_id 校验" 'task_id.*empty' "$CONTROL"
assert_contains "FetchData task_id 校验" 'task_id.*empty' "$CONTROL"
assert_contains "StatAgent ip_addr 校验" 'ip_addr.*empty' "$CONTROL"
assert_contains "错误返回 -1" 'set_code(-1)' "$CONTROL"
assert_contains "错误消息" 'set_message' "$CONTROL"
echo ""

# ============================================
# InitAgentInfoService 参数校验
# ============================================
echo "[InitAgentInfoService 参数校验]"

INIT="$PROJECT_DIR/server/InitAgentInfoService.cpp"

assert_contains "RegisterAgent uid 校验" 'uid.*empty' "$INIT"
assert_contains "RegisterAgent ip_addr 校验" 'ip_addr.*empty' "$INIT"
echo ""

# ============================================
# Agent 配置加载错误处理
# ============================================
echo "[Agent 配置加载错误处理]"

CONFIG="$PROJECT_DIR/agent/Config.cpp"

assert_contains "文件打开失败处理" 'Failed to open config' "$CONFIG"
assert_contains "JSON 解析错误处理" 'json::parse_error' "$CONFIG"
assert_contains "try 块" 'try {' "$CONFIG"
assert_contains "catch 块" 'catch' "$CONFIG"
echo ""

# ============================================
# Agent 信号处理
# ============================================
echo "[Agent 信号处理]"

AGENT_MAIN="$PROJECT_DIR/agent/main.cpp"

assert_contains "SIGINT 处理" 'SIGINT' "$AGENT_MAIN"
assert_contains "SIGTERM 处理" 'SIGTERM' "$AGENT_MAIN"
assert_contains "sigaction 使用" 'sigaction' "$AGENT_MAIN"
assert_contains "退出标志" 'g_running' "$AGENT_MAIN"
echo ""

# ============================================
# Server 信号处理
# ============================================
echo "[Server 信号处理]"

SERVER_MAIN="$PROJECT_DIR/server/main.cpp"

assert_contains "SIGINT 处理" 'SIGINT' "$SERVER_MAIN"
assert_contains "SIGTERM 处理" 'SIGTERM' "$SERVER_MAIN"
assert_contains "Server Shutdown" 'Shutdown' "$SERVER_MAIN"
echo ""

# ============================================
# gRPC 超时处理
# ============================================
echo "[gRPC 超时处理]"

AGENT_HC="$PROJECT_DIR/agent/HealthCheckChannel.cpp"
AGENT_HM="$PROJECT_DIR/agent/HotmethodChannel.cpp"

assert_contains "心跳 deadline 设置" 'set_deadline' "$AGENT_HC"
assert_contains "结果上报 deadline 设置" 'set_deadline' "$AGENT_HM"
echo ""

# ============================================
# 采集器错误处理
# ============================================
echo "[采集器错误处理]"

PERF="$PROJECT_DIR/common/Perf.cpp"
AP="$PROJECT_DIR/common/AsyncProfiler.cpp"

assert_contains "fork 失败处理" 'fork failed' "$PERF"
assert_contains "execvp 失败处理" 'execvp failed' "$PERF"
assert_contains "超时返回 -2" 'return -2' "$PERF"
assert_contains "AsyncProfiler fork 失败处理" 'fork failed' "$AP"
echo ""

# ============================================
# 存储客户端错误处理
# ============================================
echo "[存储客户端错误处理]"

STORAGE="$PROJECT_DIR/common/StorageClient.cpp"

assert_contains "fork 失败处理" 'fork failed' "$STORAGE"
assert_contains "超时处理" 'timed out' "$STORAGE"
assert_contains "上传失败日志" 'Upload failed' "$STORAGE"
assert_contains "下载失败日志" 'Download failed' "$STORAGE"
echo ""

# ============================================
# 日志级别检查
# ============================================
echo "[日志级别]"

LOG_H="$PROJECT_DIR/common/Log.h"

assert_contains "DEBUG 级别" 'DEBUG' "$LOG_H"
assert_contains "INFO 级别" 'INFO' "$LOG_H"
assert_contains "WARN 级别" 'WARN' "$LOG_H"
assert_contains "ERROR 级别" 'ERROR' "$LOG_H"
assert_contains "LOG_ERROR 宏" 'LOG_ERROR' "$LOG_H"
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
