#!/bin/bash
# Agent 端单元测试脚本
# 测试内容：配置加载、进程监控、采集器接口

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass_count=0
fail_count=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

assert_eq() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        ((pass_count++))
    else
        echo -e "  ${RED}✗${NC} $test_name (expected: $expected, actual: $actual)"
        ((fail_count++))
    fi
}

assert_contains() {
    local test_name="$1"
    local pattern="$2"
    local text="$3"

    if echo "$text" | grep -q "$pattern"; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        ((pass_count++))
    else
        echo -e "  ${RED}✗${NC} $test_name (pattern '$pattern' not found)"
        ((fail_count++))
    fi
}

# 测试 Agent 配置文件
test_config_file() {
    log_info "测试 Agent 配置文件..."

    local config_file="$PROJECT_DIR/etc/config.json.example"

    if [ -f "$config_file" ]; then
        assert_eq "config.json.example 存在" "true" "true"

        # 检查必要字段
        if grep -q '"uid"' "$config_file"; then
            assert_eq "配置包含 uid 字段" "true" "true"
        else
            assert_eq "配置包含 uid 字段" "true" "false"
        fi

        if grep -q '"server_ips"' "$config_file"; then
            assert_eq "配置包含 server_ips 字段" "true" "true"
        else
            assert_eq "配置包含 server_ips 字段" "true" "false"
        fi

        if grep -q '"storage"' "$config_file"; then
            assert_eq "配置包含 storage 字段" "true" "true"
        else
            assert_eq "配置包含 storage 字段" "true" "false"
        fi
    else
        assert_eq "config.json.example 存在" "true" "false"
    fi
}

# 测试进程监控模块
test_process_module() {
    log_info "测试进程监控模块..."

    if [ -f "$PROJECT_DIR/common/Process.h" ]; then
        assert_eq "Process.h 存在" "true" "true"

        # 检查接口定义
        if grep -q "ReadStat" "$PROJECT_DIR/common/Process.h"; then
            assert_eq "Process 包含 ReadStat 方法" "true" "true"
        else
            assert_eq "Process 包含 ReadStat 方法" "true" "false"
        fi

        if grep -q "ReadIO" "$PROJECT_DIR/common/Process.h"; then
            assert_eq "Process 包含 ReadIO 方法" "true" "true"
        else
            assert_eq "Process 包含 ReadIO 方法" "true" "false"
        fi

        if grep -q "GetPidStats" "$PROJECT_DIR/common/Process.h"; then
            assert_eq "Process 包含 GetPidStats 方法" "true" "true"
        else
            assert_eq "Process 包含 GetPidStats 方法" "true" "false"
        fi
    else
        assert_eq "Process.h 存在" "true" "false"
    fi
}

# 测试超时保护模块
test_process_killer() {
    log_info "测试超时保护模块..."

    if [ -f "$PROJECT_DIR/common/ProcessKiller.h" ]; then
        assert_eq "ProcessKiller.h 存在" "true" "true"

        # 检查接口定义
        if grep -q "Start" "$PROJECT_DIR/common/ProcessKiller.h"; then
            assert_eq "ProcessKiller 包含 Start 方法" "true" "true"
        else
            assert_eq "ProcessKiller 包含 Start 方法" "true" "false"
        fi

        if grep -q "IsTimeout" "$PROJECT_DIR/common/ProcessKiller.h"; then
            assert_eq "ProcessKiller 包含 IsTimeout 方法" "true" "true"
        else
            assert_eq "ProcessKiller 包含 IsTimeout 方法" "true" "false"
        fi
    else
        assert_eq "ProcessKiller.h 存在" "true" "false"
    fi
}

# 测试存储客户端
test_storage_client() {
    log_info "测试存储客户端..."

    if [ -f "$PROJECT_DIR/common/StorageClient.h" ]; then
        assert_eq "StorageClient.h 存在" "true" "true"

        # 检查接口定义
        if grep -q "Upload" "$PROJECT_DIR/common/StorageClient.h"; then
            assert_eq "StorageClient 包含 Upload 方法" "true" "true"
        else
            assert_eq "StorageClient 包含 Upload 方法" "true" "false"
        fi

        if grep -q "Download" "$PROJECT_DIR/common/StorageClient.h"; then
            assert_eq "StorageClient 包含 Download 方法" "true" "true"
        else
            assert_eq "StorageClient 包含 Download 方法" "true" "false"
        fi

        if grep -q "MinIOClient" "$PROJECT_DIR/common/StorageClient.h"; then
            assert_eq "StorageClient 包含 MinIOClient 实现" "true" "true"
        else
            assert_eq "StorageClient 包含 MinIOClient 实现" "true" "false"
        fi
    else
        assert_eq "StorageClient.h 存在" "true" "false"
    fi
}

# 测试守护进程模块
test_daemon_module() {
    log_info "测试守护进程模块..."

    if [ -f "$PROJECT_DIR/common/Daemon.cpp" ]; then
        assert_eq "Daemon.cpp 存在" "true" "true"

        # 检查是否包含守护化进程化逻辑
        if grep -q "fork" "$PROJECT_DIR/common/Daemon.cpp"; then
            assert_eq "Daemon 包含 fork 调用" "true" "true"
        else
            assert_eq "Daemon 包含 fork 调用" "true" "false"
        fi

        if grep -q "setsid" "$PROJECT_DIR/common/Daemon.cpp"; then
            assert_eq "Daemon 包含 setsid 调用" "true" "true"
        else
            assert_eq "Daemon 包含 setsid 调用" "true" "false"
        fi
    else
        assert_eq "Daemon.cpp 存在" "true" "false"
    fi
}

# 测试容器信息检测
test_container_info() {
    log_info "测试容器信息检测..."

    if [ -f "$PROJECT_DIR/common/ContainerInfo.h" ] || [ -f "$PROJECT_DIR/agent/ContainerInfo.h" ]; then
        assert_eq "ContainerInfo.h 存在" "true" "true"

        local header_file="$PROJECT_DIR/agent/ContainerInfo.h"

        if grep -q "Detect" "$header_file"; then
            assert_eq "ContainerInfo 包含 Detect 方法" "true" "true"
        else
            assert_eq "ContainerInfo 包含 Detect 方法" "true" "false"
        fi
    else
        assert_eq "ContainerInfo.h 存在" "true" "false"
    fi
}

# 测试 Perf 采集器
test_perf_profiler() {
    log_info "测试 Perf 采集器..."

    if [ -f "$PROJECT_DIR/common/Perf.h" ]; then
        assert_eq "Perf.h 存在" "true" "true"

        if grep -q "Record" "$PROJECT_DIR/common/Perf.h"; then
            assert_eq "Perf 包含 Record 方法" "true" "true"
        else
            assert_eq "Perf 包含 Record 方法" "true" "false"
        fi

        if grep -q "Script" "$PROJECT_DIR/common/Perf.h"; then
            assert_eq "Perf 包含 Script 方法" "true" "true"
        else
            assert_eq "Perf 包含 Script 方法" "true" "false"
        fi
    else
        assert_eq "Perf.h 存在" "true" "false"
    fi
}

# 测试 Agent 配置加载（实际运行）
test_agent_config_loading() {
    log_info "测试 Agent 配置加载..."

    # 检查是否可以编译运行（如果已编译）
    if [ -f "$BUILD_DIR/drop_agent" ]; then
        # 尝试用无效配置启动，应该报错但不会崩溃
        timeout 2 "$BUILD_DIR/drop_agent" /nonexistent/config.json > /tmp/agent_config_test.log 2>&1 || true

        if [ -f /tmp/agent_config_test.log ]; then
            assert_contains "Agent 无效配置报错" "Failed to open config" "$(cat /tmp/agent_config_test.log)"
            rm -f /tmp/agent_config_test.log
        fi
    else
        log_info "drop_agent 未编译，跳过运行时测试"
    fi
}

# 主测试流程
main() {
    echo "=========================================="
    echo "  Agent 端单元测试"
    echo "=========================================="
    echo ""

    test_config_file
    echo ""

    test_process_module
    echo ""

    test_process_killer
    echo ""

    test_storage_client
    echo ""

    test_daemon_module
    echo ""

    test_container_info
    echo ""

    test_perf_profiler
    echo ""

    test_agent_config_loading
    echo ""

    echo "=========================================="
    echo "  测试结果: ${GREEN}$pass_count 通过${NC}, ${RED}$fail_count 失败${NC}"
    echo "=========================================="

    if [ $fail_count -gt 0 ]; then
        exit 1
    fi
}

main "$@"
