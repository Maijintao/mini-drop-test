#!/bin/bash
# gRPC 服务接口完整性测试
# 检查 4 个 gRPC 服务的实现是否符合复刻指南

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

check_service() {
    local name="$1"
    local header="$2"
    local impl="$3"
    local service_pattern="$4"

    echo "[$name]"

    assert_contains "继承 Service" "$service_pattern" "$header"
    assert_contains "头文件存在" 'pragma once' "$header"
    assert_contains "实现文件存在" '#include' "$impl"
    echo ""
}

echo "=========================================="
echo "  gRPC 服务接口完整性测试"
echo "=========================================="
echo ""

# ============================================
# HealthCheckService
# ============================================
check_service "HealthCheckService (Agent → Server 心跳)" \
    "$PROJECT_DIR/server/HealthCheckService.h" \
    "$PROJECT_DIR/server/HealthCheckService.cpp" \
    'HealthCheck::Service'

echo "[HealthCheckService 方法]"
assert_contains "Do 方法声明" 'grpc::Status Do' "$PROJECT_DIR/server/HealthCheckService.h"
assert_contains "Do 方法实现" 'HealthCheckService::Do' "$PROJECT_DIR/server/HealthCheckService.cpp"
assert_contains "记录心跳日志" 'Heartbeat from' "$PROJECT_DIR/server/HealthCheckService.cpp"
assert_contains "更新 Agent 状态" 'UpdateAgentStatus' "$PROJECT_DIR/server/HealthCheckService.cpp"
assert_contains "派发任务" 'PopTask' "$PROJECT_DIR/server/HealthCheckService.cpp"
echo ""

# ============================================
# HotmethodService
# ============================================
check_service "HotmethodService (任务队列 + 结果缓存)" \
    "$PROJECT_DIR/server/HotmethodService.h" \
    "$PROJECT_DIR/server/HotmethodService.cpp" \
    'Hotmethod::Service'

echo "[HotmethodService 方法]"
assert_contains "NotifyResult 方法声明" 'grpc::Status NotifyResult' "$PROJECT_DIR/server/HotmethodService.h"
assert_contains "NotifyResult 实现" 'HotmethodService::NotifyResult' "$PROJECT_DIR/server/HotmethodService.cpp"
assert_contains "PushTask 方法" 'bool PushTask' "$PROJECT_DIR/server/HotmethodService.h"
assert_contains "PopTask 方法" 'bool PopTask' "$PROJECT_DIR/server/HotmethodService.h"
assert_contains "GetResult 方法" 'bool GetResult' "$PROJECT_DIR/server/HotmethodService.h"
echo ""

# ============================================
# ControlService
# ============================================
check_service "ControlService (apiserver → Server 控制平面)" \
    "$PROJECT_DIR/server/ControlService.h" \
    "$PROJECT_DIR/server/ControlService.cpp" \
    'Control::Service'

echo "[ControlService 方法]"
assert_contains "CreateTask 方法声明" 'grpc::Status CreateTask' "$PROJECT_DIR/server/ControlService.h"
assert_contains "CreateTask 实现" 'ControlService::CreateTask' "$PROJECT_DIR/server/ControlService.cpp"
assert_contains "FetchData 方法声明" 'grpc::Status FetchData' "$PROJECT_DIR/server/ControlService.h"
assert_contains "FetchData 实现" 'ControlService::FetchData' "$PROJECT_DIR/server/ControlService.cpp"
assert_contains "StatAgent 方法声明" 'grpc::Status StatAgent' "$PROJECT_DIR/server/ControlService.h"
assert_contains "StatAgent 实现" 'ControlService::StatAgent' "$PROJECT_DIR/server/ControlService.cpp"
echo ""

# ============================================
# InitAgentInfoService
# ============================================
check_service "InitAgentInfoService (Agent 启动时注册和配置拉取)" \
    "$PROJECT_DIR/server/InitAgentInfoService.h" \
    "$PROJECT_DIR/server/InitAgentInfoService.cpp" \
    'Init::Service'

echo "[InitAgentInfoService 方法]"
assert_contains "RegisterAgent 方法声明" 'grpc::Status RegisterAgent' "$PROJECT_DIR/server/InitAgentInfoService.h"
assert_contains "RegisterAgent 实现" 'InitAgentInfoService::RegisterAgent' "$PROJECT_DIR/server/InitAgentInfoService.cpp"
assert_contains "FetchConfig 方法声明" 'grpc::Status FetchConfig' "$PROJECT_DIR/server/InitAgentInfoService.h"
assert_contains "FetchConfig 实现" 'InitAgentInfoService::FetchConfig' "$PROJECT_DIR/server/InitAgentInfoService.cpp"
assert_contains "返回 CosConfig" 'cos_config' "$PROJECT_DIR/server/InitAgentInfoService.cpp"
echo ""

# ============================================
# Server main.cpp 服务注册检查
# ============================================
echo "[Server main.cpp 服务注册]"

MAIN="$PROJECT_DIR/server/main.cpp"

assert_contains "HealthCheckService 注册" 'RegisterService.*health_service' "$MAIN"
assert_contains "HotmethodService 注册" 'RegisterService.*hotmethod_service' "$MAIN"
assert_contains "ControlService 注册" 'RegisterService.*control_service' "$MAIN"
assert_contains "InitAgentInfoService 注册" 'RegisterService.*init_service' "$MAIN"
assert_contains "监听端口" 'AddListeningPort' "$MAIN"
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
