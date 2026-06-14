#!/bin/bash
# Proto 文件完整性验证
# 检查所有 proto 文件的语法、字段定义、服务定义是否符合复刻指南

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass_count=0
fail_count=0

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
echo "  Proto 文件完整性验证"
echo "=========================================="
echo ""

# ============================================
# common.proto
# ============================================
echo "[common.proto]"
COMMON="$PROJECT_DIR/common/proto/common.proto"

assert_contains "syntax 声明" 'syntax = "proto3"' "$COMMON"
assert_contains "package 声明" 'package drop' "$COMMON"
assert_contains "PidStats message" 'message PidStats' "$COMMON"
assert_contains "PidStats.pid 字段" 'int32 pid = 1' "$COMMON"
assert_contains "PidStats.cpu_percent 字段" 'float cpu_percent = 2' "$COMMON"
assert_contains "PidStats.rss_kb 字段" 'int64 rss_kb = 3' "$COMMON"
assert_contains "PidStats.read_kb_per_sec 字段" 'int64 read_kb_per_sec = 4' "$COMMON"
assert_contains "PidStats.write_kb_per_sec 字段" 'int64 write_kb_per_sec = 5' "$COMMON"
assert_contains "File message" 'message File' "$COMMON"
assert_contains "CosConfig message" 'message CosConfig' "$COMMON"
echo ""

# ============================================
# healthcheck.proto
# ============================================
echo "[healthcheck.proto]"
HEALTHCHECK="$PROJECT_DIR/common/proto/healthcheck.proto"

assert_contains "syntax 声明" 'syntax = "proto3"' "$HEALTHCHECK"
assert_contains "import common.proto" 'import "common.proto"' "$HEALTHCHECK"
assert_contains "HealthCheck service" 'service HealthCheck' "$HEALTHCHECK"
assert_contains "Do 方法" 'rpc Do(HealthCheckRequest) returns (HealthCheckResponse)' "$HEALTHCHECK"
assert_contains "HealthCheckRequest message" 'message HealthCheckRequest' "$HEALTHCHECK"
assert_contains "HealthCheckRequest.host_name" 'string host_name = 1' "$HEALTHCHECK"
assert_contains "HealthCheckRequest.ip_addr" 'string ip_addr = 2' "$HEALTHCHECK"
assert_contains "HealthCheckRequest.uid" 'string uid = 3' "$HEALTHCHECK"
assert_contains "HealthCheckResponse message" 'message HealthCheckResponse' "$HEALTHCHECK"
assert_contains "ServingStatus 枚举" 'ServingStatus' "$HEALTHCHECK"
assert_contains "HealthCheckResponse.pending" 'bool pending = 2' "$HEALTHCHECK"
assert_contains "TaskDesc message" 'message TaskDesc' "$HEALTHCHECK"
assert_contains "TaskDesc.task_id" 'string task_id = 1' "$HEALTHCHECK"
assert_contains "TaskDesc.task_type" 'uint32 task_type = 2' "$HEALTHCHECK"
assert_contains "TaskDesc.profiler_type" 'uint32 profiler_type = 3' "$HEALTHCHECK"
assert_contains "TaskDesc.sample_argv" 'RecordArgv sample_argv = 4' "$HEALTHCHECK"
assert_contains "TaskDesc.timeout_sec" 'uint32 timeout_sec = 7' "$HEALTHCHECK"
assert_contains "RecordArgv message" 'message RecordArgv' "$HEALTHCHECK"
assert_contains "RecordArgv.hz" 'uint32 hz = 1' "$HEALTHCHECK"
assert_contains "RecordArgv.duration" 'uint64 duration = 2' "$HEALTHCHECK"
assert_contains "RecordArgv.pid" 'int32 pid = 3' "$HEALTHCHECK"
echo ""

# ============================================
# hotmethod.proto
# ============================================
echo "[hotmethod.proto]"
HOTMETHOD="$PROJECT_DIR/common/proto/hotmethod.proto"

assert_contains "syntax 声明" 'syntax = "proto3"' "$HOTMETHOD"
assert_contains "import common.proto" 'import "common.proto"' "$HOTMETHOD"
assert_contains "import empty.proto" 'import "google/protobuf/empty.proto"' "$HOTMETHOD"
assert_contains "Hotmethod service" 'service Hotmethod' "$HOTMETHOD"
assert_contains "NotifyResult 方法" 'rpc NotifyResult(TaskResult) returns (google.protobuf.Empty)' "$HOTMETHOD"
assert_contains "TaskResult message" 'message TaskResult' "$HOTMETHOD"
assert_contains "TaskResult.task_id" 'string task_id = 1' "$HOTMETHOD"
assert_contains "TaskResult.error_message" 'string error_message = 2' "$HOTMETHOD"
assert_contains "TaskResult.cos_key" 'string cos_key = 4' "$HOTMETHOD"
echo ""

# ============================================
# control.proto
# ============================================
echo "[control.proto]"
CONTROL="$PROJECT_DIR/common/proto/control.proto"

assert_contains "syntax 声明" 'syntax = "proto3"' "$CONTROL"
assert_contains "import common.proto" 'import "common.proto"' "$CONTROL"
assert_contains "import healthcheck.proto" 'import "healthcheck.proto"' "$CONTROL"
assert_contains "Control service" 'service Control' "$CONTROL"
assert_contains "CreateTask 方法" 'rpc CreateTask(CreateTaskRequest) returns (CreateTaskResponse)' "$CONTROL"
assert_contains "FetchData 方法" 'rpc FetchData(FetchDataRequest) returns (FetchDataResponse)' "$CONTROL"
assert_contains "StatAgent 方法" 'rpc StatAgent(StatAgentRequest) returns (StatAgentResponse)' "$CONTROL"
assert_contains "CreateTaskRequest.message" 'message CreateTaskRequest' "$CONTROL"
assert_contains "CreateTaskRequest.target_ip" 'string target_ip = 1' "$CONTROL"
assert_contains "CreateTaskRequest.task_desc" 'TaskDesc task_desc = 3' "$CONTROL"
assert_contains "StatAgentRequest.ip_addr" 'string ip_addr = 1' "$CONTROL"
echo ""

# ============================================
# init.proto
# ============================================
echo "[init.proto]"
INIT="$PROJECT_DIR/common/proto/init.proto"

assert_contains "syntax 声明" 'syntax = "proto3"' "$INIT"
assert_contains "import common.proto" 'import "common.proto"' "$INIT"
assert_contains "Init service" 'service Init' "$INIT"
assert_contains "RegisterAgent 方法" 'rpc RegisterAgent(RegisterAgentRequest) returns (RegisterAgentResponse)' "$INIT"
assert_contains "FetchConfig 方法" 'rpc FetchConfig(FetchConfigRequest) returns (FetchConfigResponse)' "$INIT"
assert_contains "RegisterAgentRequest.message" 'message RegisterAgentRequest' "$INIT"
assert_contains "RegisterAgentRequest.uid" 'string uid = 3' "$INIT"
assert_contains "RegisterAgentRequest.ip_addr" 'string ip_addr = 2' "$INIT"
assert_contains "FetchConfigResponse.cos_config" 'CosConfig cos_config = 2' "$INIT"
echo ""

# ============================================
# 检查 proto 文件是否可以被 protoc 编译
# ============================================
echo "[Protoc 编译检查]"
if command -v protoc &> /dev/null; then
    # 尝试编译 proto 文件
    mkdir -p /tmp/proto_test
    if protoc --proto_path="$PROJECT_DIR/common/proto" \
              --cpp_out=/tmp/proto_test \
              "$PROJECT_DIR/common/proto/common.proto" \
              "$PROJECT_DIR/common/proto/healthcheck.proto" \
              "$PROJECT_DIR/common/proto/hotmethod.proto" \
              "$PROJECT_DIR/common/proto/control.proto" \
              "$PROJECT_DIR/common/proto/init.proto" 2>/dev/null; then
        assert_eq "Proto 文件可编译" "true" "true"
        rm -rf /tmp/proto_test
    else
        assert_eq "Proto 文件可编译" "true" "false"
        rm -rf /tmp/proto_test
    fi
else
    echo -e "  \033[1;33m⚠\033[0m protoc 未安装，跳过编译检查"
    pass_count=$((pass_count + 1))
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
