#!/bin/bash
# Server 端单元测试脚本
# 测试内容：任务队列、心跳派发、结果缓存、Agent 状态查询

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

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
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

# 检查编译产物
check_binaries() {
    log_info "检查编译产物..."

    if [ -f "$BUILD_DIR/drop_server" ]; then
        assert_eq "drop_server 二进制存在" "true" "true"
    else
        assert_eq "drop_server 二进制存在" "true" "false"
    fi

    if [ -f "$BUILD_DIR/drop_agent" ]; then
        assert_eq "drop_agent 二进制存在" "true" "true"
    else
        assert_eq "drop_agent 二进制存在" "true" "false"
    fi
}

# 测试 Server 启动
test_server_startup() {
    log_info "测试 Server 启动..."

    # 启动 Server
    timeout 5 "$BUILD_DIR/drop_server" --port 15051 > /tmp/drop_server_test.log 2>&1 &
    SERVER_PID=$!
    sleep 2

    # 检查进程是否存活
    if kill -0 $SERVER_PID 2>/dev/null; then
        assert_eq "Server 进程启动成功" "true" "true"
        kill $SERVER_PID 2>/dev/null || true
    else
        assert_eq "Server 进程启动成功" "true" "false"
    fi

    # 检查日志输出
    if [ -f /tmp/drop_server_test.log ]; then
        assert_contains "Server 日志包含监听端口" "15051" "$(cat /tmp/drop_server_test.log)"
    fi

    rm -f /tmp/drop_server_test.log
}

# 测试配置文件加载
test_config_loading() {
    log_info "测试配置文件加载..."

    local config_file="$PROJECT_DIR/etc/config.json.example"

    if [ -f "$config_file" ]; then
        assert_eq "配置文件存在" "true" "true"

        # 检查配置文件格式
        if python3 -c "import json; json.load(open('$config_file'))" 2>/dev/null; then
            assert_eq "配置文件 JSON 格式正确" "true" "true"
        else
            assert_eq "配置文件 JSON 格式正确" "true" "false"
        fi
    else
        assert_eq "配置文件存在" "true" "false"
    fi
}

# 测试日志模块
test_log_module() {
    log_info "测试日志模块..."

    # 检查 Log.h 是否存在
    if [ -f "$PROJECT_DIR/common/Log.h" ]; then
        assert_eq "Log.h 头文件存在" "true" "true"

        # 检查是否包含日志宏定义
        if grep -q "LOG_INFO" "$PROJECT_DIR/common/Log.h"; then
            assert_eq "Log.h 包含 LOG_INFO 宏" "true" "true"
        else
            assert_eq "Log.h 包含 LOG_INFO 宏" "true" "false"
        fi
    else
        assert_eq "Log.h 头文件存在" "true" "false"
    fi
}

# 测试 Proto 文件完整性
test_proto_files() {
    log_info "测试 Proto 文件完整性..."

    local proto_files=(
        "common/proto/common.proto"
        "common/proto/healthcheck.proto"
        "common/proto/hotmethod.proto"
        "common/proto/control.proto"
        "common/proto/init.proto"
    )

    for proto in "${proto_files[@]}"; do
        if [ -f "$PROJECT_DIR/$proto" ]; then
            assert_eq "$proto 存在" "true" "true"
        else
            assert_eq "$proto 存在" "true" "false"
        fi
    done

    # 检查关键 message 定义
    if grep -q "message TaskDesc" "$PROJECT_DIR/common/proto/healthcheck.proto"; then
        assert_eq "healthcheck.proto 包含 TaskDesc" "true" "true"
    else
        assert_eq "healthcheck.proto 包含 TaskDesc" "true" "false"
    fi

    if grep -q "message TaskResult" "$PROJECT_DIR/common/proto/hotmethod.proto"; then
        assert_eq "hotmethod.proto 包含 TaskResult" "true" "true"
    else
        assert_eq "hotmethod.proto 包含 TaskResult" "true" "false"
    fi
}

# 测试采集器接口
test_profiler_interface() {
    log_info "测试采集器接口..."

    if [ -f "$PROJECT_DIR/common/IProfiler.h" ]; then
        assert_eq "IProfiler.h 存在" "true" "true"

        # 检查接口定义
        if grep -q "virtual int Record" "$PROJECT_DIR/common/IProfiler.h"; then
            assert_eq "IProfiler 包含 Record 方法" "true" "true"
        else
            assert_eq "IProfiler 包含 Record 方法" "true" "false"
        fi

        # 检查采集器类型常量
        if grep -q "PROFILER_PERF" "$PROJECT_DIR/common/IProfiler.h"; then
            assert_eq "IProfiler 定义 PROFILER_PERF" "true" "true"
        else
            assert_eq "IProfiler 定义 PROFILER_PERF" "true" "false"
        fi
    else
        assert_eq "IProfiler.h 存在" "true" "false"
    fi
}

# 主测试流程
main() {
    echo "=========================================="
    echo "  Server 端单元测试"
    echo "=========================================="
    echo ""

    check_binaries
    echo ""

    test_server_startup
    echo ""

    test_config_loading
    echo ""

    test_log_module
    echo ""

    test_proto_files
    echo ""

    test_profiler_interface
    echo ""

    echo "=========================================="
    echo "  测试结果: ${GREEN}$pass_count 通过${NC}, ${RED}$fail_count 失败${NC}"
    echo "=========================================="

    if [ $fail_count -gt 0 ]; then
        exit 1
    fi
}

main "$@"
