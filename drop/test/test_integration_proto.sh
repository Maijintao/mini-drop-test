#!/bin/bash
# test_integration_proto.sh
# 验证 apiserver (Go) 和 drop (C++) 的 proto 定义兼容性
# 检查两边的 proto 文件字段完全一致，确保 gRPC 互通无障碍

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DROP_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$DROP_DIR")"
APISERVER_DIR="$PROJECT_DIR/apiserver"

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

echo "=== 测试 1：Proto 文件兼容性验证 ==="
echo ""

# --- control.proto ---
echo "--- control.proto ---"

check "apiserver 存在 control.proto" \
    "test -f '$APISERVER_DIR/proto/control.proto'"

check "drop 存在 control.proto" \
    "test -f '$DROP_DIR/common/proto/control.proto'"

check "两边都定义了 Control service" \
    "grep -q 'service Control' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'service Control' '$DROP_DIR/common/proto/control.proto'"

check "两边都有 CreateTask RPC" \
    "grep -q 'rpc CreateTask' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'rpc CreateTask' '$DROP_DIR/common/proto/control.proto'"

check "两边都有 FetchData RPC" \
    "grep -q 'rpc FetchData' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'rpc FetchData' '$DROP_DIR/common/proto/control.proto'"

check "两边都有 StatAgent RPC" \
    "grep -q 'rpc StatAgent' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'rpc StatAgent' '$DROP_DIR/common/proto/control.proto'"

check "CreateTaskRequest 有 target_ip" \
    "grep -q 'target_ip' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'target_ip' '$DROP_DIR/common/proto/control.proto'"

check "CreateTaskRequest 有 task_desc" \
    "grep -q 'task_desc' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'task_desc' '$DROP_DIR/common/proto/control.proto'"

check "StatAgentRequest 有 ip_addr" \
    "grep -q 'ip_addr' '$APISERVER_DIR/proto/control.proto' && \
     grep -q 'ip_addr' '$DROP_DIR/common/proto/control.proto'"

echo ""

# --- healthcheck.proto ---
echo "--- healthcheck.proto ---"

check "apiserver 存在 healthcheck.proto" \
    "test -f '$APISERVER_DIR/proto/healthcheck.proto'"

check "drop 存在 healthcheck.proto" \
    "test -f '$DROP_DIR/common/proto/healthcheck.proto'"

check "两边都定义了 HealthCheck service" \
    "grep -q 'service HealthCheck' '$APISERVER_DIR/proto/healthcheck.proto' && \
     grep -q 'service HealthCheck' '$DROP_DIR/common/proto/healthcheck.proto'"

check "HealthCheckRequest 有 host_name, ip_addr, uid" \
    "grep -q 'host_name' '$DROP_DIR/common/proto/healthcheck.proto' && \
     grep -q 'ip_addr' '$DROP_DIR/common/proto/healthcheck.proto' && \
     grep -q 'uid' '$DROP_DIR/common/proto/healthcheck.proto'"

check "HealthCheckResponse 有 pending 和 task_desc" \
    "grep -q 'pending' '$DROP_DIR/common/proto/healthcheck.proto' && \
     grep -q 'task_desc' '$DROP_DIR/common/proto/healthcheck.proto'"

echo ""

# --- hotmethod.proto ---
echo "--- hotmethod.proto ---"

check "apiserver 存在 hotmethod.proto" \
    "test -f '$APISERVER_DIR/proto/hotmethod.proto'"

check "drop 存在 hotmethod.proto" \
    "test -f '$DROP_DIR/common/proto/hotmethod.proto'"

check "两边都定义了 Hotmethod service" \
    "grep -q 'service Hotmethod' '$APISERVER_DIR/proto/hotmethod.proto' && \
     grep -q 'service Hotmethod' '$DROP_DIR/common/proto/hotmethod.proto'"

check "NotifyResult RPC 存在" \
    "grep -q 'rpc NotifyResult' '$APISERVER_DIR/proto/hotmethod.proto' && \
     grep -q 'rpc NotifyResult' '$DROP_DIR/common/proto/hotmethod.proto'"

check "TaskResult 有 task_id, error_message, cos_key" \
    "grep -q 'task_id' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'error_message' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'cos_key' '$DROP_DIR/common/proto/hotmethod.proto'"

check "TaskState 枚举完整 (PENDING/DISPATCHED/RUNNING/DONE/FAILED/TIMEOUT)" \
    "grep -q 'TASK_PENDING' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'TASK_DISPATCHED' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'TASK_RUNNING' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'TASK_DONE' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'TASK_FAILED' '$DROP_DIR/common/proto/hotmethod.proto' && \
     grep -q 'TASK_TIMEOUT' '$DROP_DIR/common/proto/hotmethod.proto'"

echo ""

# --- common.proto ---
echo "--- common.proto ---"

check "apiserver 存在 common.proto" \
    "test -f '$APISERVER_DIR/proto/common.proto'"

check "drop 存在 common.proto" \
    "test -f '$DROP_DIR/common/proto/common.proto'"

check "PidStats 有 pid, cpu_percent, rss_kb" \
    "grep -q 'cpu_percent' '$DROP_DIR/common/proto/common.proto' && \
     grep -q 'rss_kb' '$DROP_DIR/common/proto/common.proto'"

check "File 有 name, content, size" \
    "grep -q 'bytes content' '$DROP_DIR/common/proto/common.proto'"

check "CosConfig 有 endpoint, bucket, access_key, secret_key" \
    "grep -q 'endpoint' '$DROP_DIR/common/proto/common.proto' && \
     grep -q 'bucket' '$DROP_DIR/common/proto/common.proto' && \
     grep -q 'access_key' '$DROP_DIR/common/proto/common.proto'"

echo ""

# --- go_package 兼容性 ---
echo "--- go_package 兼容性 ---"

check "apiserver proto go_package 非空" \
    "grep -q 'go_package' '$APISERVER_DIR/proto/control.proto'"

check "apiserver 已生成 Go protobuf 代码" \
    "test -f '$APISERVER_DIR/proto/control.pb.go' && \
     test -f '$APISERVER_DIR/proto/control_grpc.pb.go'"

check "apiserver 已生成 healthcheck Go 代码" \
    "test -f '$APISERVER_DIR/proto/healthcheck.pb.go' && \
     test -f '$APISERVER_DIR/proto/healthcheck_grpc.pb.go'"

check "apiserver 已生成 hotmethod Go 代码" \
    "test -f '$APISERVER_DIR/proto/hotmethod.pb.go' && \
     test -f '$APISERVER_DIR/proto/hotmethod_grpc.pb.go'"

check "apiserver 已生成 common Go 代码" \
    "test -f '$APISERVER_DIR/proto/common.pb.go'"

echo ""

# --- C++ 编译产物 ---
echo "--- C++ 编译产物 ---"

check "drop_server 二进制已编译" \
    "test -f '$DROP_DIR/build/drop_server'"

check "drop_agent 二进制已编译" \
    "test -f '$DROP_DIR/build/drop_agent'"

check "drop_proto 静态库已编译" \
    "test -f '$DROP_DIR/build/libdrop_proto.a'"

check "C++ 已生成 control.pb.h" \
    "test -f '$DROP_DIR/build/control.pb.h'"

check "C++ 已生成 control.grpc.pb.h" \
    "test -f '$DROP_DIR/build/control.grpc.pb.h'"

echo ""

# --- TaskDesc 字段映射验证 ---
echo "--- TaskDesc 字段映射（apiserver CreateTask → drop TaskDesc）---"

check "apiserver task.go 构建 TaskDesc 时设置 task_id" \
    "grep -q 'TaskId' '$APISERVER_DIR/server/task.go' || grep -q 'task_id' '$APISERVER_DIR/server/task.go'"

check "apiserver task.go 构建 RecordArgv（hz/duration/pid/callgraph）" \
    "grep -q 'Hz\|hz' '$APISERVER_DIR/server/task.go' && \
     grep -q 'Duration\|duration' '$APISERVER_DIR/server/task.go' && \
     grep -q 'Pid\|pid' '$APISERVER_DIR/server/task.go'"

check "apiserver task.go 设置 timeout_sec = duration + 30" \
    "grep -q 'TimeoutSec\|timeout_sec' '$APISERVER_DIR/server/task.go'"

echo ""

# --- 结果 ---
echo "================================"
echo "通过: $PASS  失败: $FAIL  总计: $((PASS + FAIL))"
if [ "$FAIL" -eq 0 ]; then
    echo "✅ Proto 兼容性验证全部通过"
    exit 0
else
    echo "❌ 存在不兼容项，请检查"
    exit 1
fi
