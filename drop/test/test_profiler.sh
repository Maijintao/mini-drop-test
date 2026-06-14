#!/bin/bash
# 采集器接口测试
# 检查 IProfiler 接口和各采集器实现是否符合复刻指南

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

check_profiler() {
    local name="$1"
    local header="$2"
    local impl="$3"

    echo "[$name]"

    assert_contains "头文件存在" 'pragma once' "$header"
    assert_contains "继承 IProfiler" 'IProfiler' "$header"
    assert_contains "Record 方法声明" 'int Record' "$header"
    assert_contains "Name 方法声明" 'std::string Name' "$header"
    assert_contains "Type 方法声明" 'int Type' "$header"
    assert_contains "Record 方法实现" "::Record" "$impl"
    assert_contains "fork 调用" 'fork()' "$impl"
    assert_contains "execvp 调用" 'execvp' "$impl"
    assert_contains "waitpid 调用" 'waitpid' "$impl"
    assert_contains "超时保护" 'ProcessKiller' "$impl"
    echo ""
}

echo "=========================================="
echo "  采集器接口测试"
echo "=========================================="
echo ""

# ============================================
# IProfiler 接口检查
# ============================================
echo "[IProfiler 接口]"

IPROFILER="$PROJECT_DIR/common/IProfiler.h"

assert_contains "头文件保护" 'pragma once' "$IPROFILER"
assert_contains "虚析构函数" 'virtual ~IProfiler' "$IPROFILER"
assert_contains "纯虚 Record 方法" 'virtual int Record.*= 0' "$IPROFILER"
assert_contains "纯虚 Name 方法" 'virtual std::string Name.*= 0' "$IPROFILER"
assert_contains "纯虚 Type 方法" 'virtual int Type.*= 0' "$IPROFILER"
assert_contains "PROFILER_PERF 常量" 'PROFILER_PERF = 0' "$IPROFILER"
assert_contains "PROFILER_ASYNC_PROFILER 常量" 'PROFILER_ASYNC_PROFILER = 1' "$IPROFILER"
assert_contains "PROFILER_PPROF 常量" 'PROFILER_PPROF = 2' "$IPROFILER"
assert_contains "PROFILER_BPFTRACE 常量" 'PROFILER_BPFTRACE = 3' "$IPROFILER"
echo ""

# ============================================
# Perf 采集器
# ============================================
check_profiler "Perf 采集器" \
    "$PROJECT_DIR/common/Perf.h" \
    "$PROJECT_DIR/common/Perf.cpp"

echo "[Perf 特殊检查]"
assert_contains "perf record 命令" 'perf.*record' "$PROJECT_DIR/common/Perf.cpp"
assert_contains "采样频率参数" '\-F' "$PROJECT_DIR/common/Perf.cpp"
assert_contains "callgraph 参数" '\-g' "$PROJECT_DIR/common/Perf.cpp"
assert_contains "目标 PID 参数" '\-p' "$PROJECT_DIR/common/Perf.cpp"
assert_contains "输出文件参数" '\-o' "$PROJECT_DIR/common/Perf.cpp"
echo ""

# ============================================
# AsyncProfiler 采集器
# ============================================
check_profiler "AsyncProfiler 采集器" \
    "$PROJECT_DIR/common/AsyncProfiler.h" \
    "$PROJECT_DIR/common/AsyncProfiler.cpp"

echo "[AsyncProfiler 特殊检查]"
assert_contains "asprof 路径" 'PROFILER_PATH' "$PROJECT_DIR/common/AsyncProfiler.h"
assert_contains "duration 参数" '\-d' "$PROJECT_DIR/common/AsyncProfiler.cpp"
assert_contains "输出文件参数" '\-f' "$PROJECT_DIR/common/AsyncProfiler.cpp"
assert_contains "事件类型参数" '\-e.*cpu' "$PROJECT_DIR/common/AsyncProfiler.cpp"
echo ""

# ============================================
# PprofProfiler 采集器
# ============================================
check_profiler "PprofProfiler 采集器" \
    "$PROJECT_DIR/common/PprofProfiler.h" \
    "$PROJECT_DIR/common/PprofProfiler.cpp"

echo "[PprofProfiler 特殊检查]"
assert_contains "FetchFromHTTP 方法" 'int FetchFromHTTP' "$PROJECT_DIR/common/PprofProfiler.h"
assert_contains "curl 命令" 'curl' "$PROJECT_DIR/common/PprofProfiler.cpp"
assert_contains "pprof URL" 'pprof/profile' "$PROJECT_DIR/common/PprofProfiler.cpp"
echo ""

# ============================================
# BpftraceProfiler 采集器
# ============================================
check_profiler "BpftraceProfiler 采集器" \
    "$PROJECT_DIR/common/BpftraceProfiler.h" \
    "$PROJECT_DIR/common/BpftraceProfiler.cpp"

echo "[BpftraceProfiler 特殊检查]"
assert_contains "IO 探针脚本" 'GenerateIOProbeScript' "$PROJECT_DIR/common/BpftraceProfiler.h"
assert_contains "调度探针脚本" 'GenerateSchedProbeScript' "$PROJECT_DIR/common/BpftraceProfiler.h"
assert_contains "bpftrace 命令" 'bpftrace' "$PROJECT_DIR/common/BpftraceProfiler.cpp"
assert_contains "block_rq_issue 追踪" 'block:block_rq_issue' "$PROJECT_DIR/common/BpftraceProfiler.cpp"
assert_contains "sched_wakeup 追踪" 'sched:sched_wakeup' "$PROJECT_DIR/common/BpftraceProfiler.cpp"
echo ""

# ============================================
# ProcessKiller 超时保护
# ============================================
echo "[ProcessKiller 超时保护]"

KILLER_HEADER="$PROJECT_DIR/common/ProcessKiller.h"
KILLER_IMPL="$PROJECT_DIR/common/ProcessKiller.cpp"

assert_contains "Start 方法" 'void Start' "$KILLER_HEADER"
assert_contains "Stop 方法" 'void Stop' "$KILLER_HEADER"
assert_contains "IsTimeout 方法" 'bool IsTimeout' "$KILLER_HEADER"
assert_contains "监控线程" 'std::thread' "$KILLER_HEADER"
assert_contains "超时标志" 'std::atomic<bool> timeout_' "$KILLER_HEADER"
assert_contains "SIGTERM 发送" 'SIGTERM' "$KILLER_IMPL"
assert_contains "SIGKILL 发送" 'SIGKILL' "$KILLER_IMPL"
assert_contains "进程组杀" 'killpg' "$KILLER_IMPL"
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
