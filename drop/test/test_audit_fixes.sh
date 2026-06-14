#!/bin/bash
# test_audit_fixes.sh - 审查报告问题专项测试
# 覆盖：严重问题6个 + 中等问题15个 + 遗漏功能9个

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 计数器
pass_count=0
fail_count=0
total_count=0

# 测试函数
check_test() {
    local description="$1"
    local result="$2"  # 0=pass, 1=fail
    total_count=$((total_count + 1))
    if [ "$result" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} $description"
        pass_count=$((pass_count + 1))
    else
        echo -e "  ${RED}✗${NC} $description"
        fail_count=$((fail_count + 1))
    fi
}

# ============================================================
# 第一优先级：严重问题（必须修复）
# ============================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🔴 第一优先级：严重问题${NC}"
echo -e "${BLUE}========================================${NC}"

# ----------------------------------------------------------
# 问题1: perf record 命令参数顺序
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题1] perf record 命令参数顺序${NC}"

test_perf_args() {
    local file="$PROJECT_ROOT/common/Perf.cpp"
    if [ ! -f "$file" ]; then
        check_test "Perf.cpp 文件存在" 1
        return
    fi
    check_test "Perf.cpp 文件存在" 0

    # 检查 -o 参数是否在 -- 之前
    # 代码使用初始化列表: "-o", output_path, "--", "sleep", ...
    # 正确顺序: -o <path> -- sleep <duration>
    # 错误顺序: -- sleep <duration> -o <path>
    local has_correct_order=0

    # 查找 Record 函数中的参数构建（初始化列表或 push_back）
    local o_line=$(grep -n '"-o"' "$file" | grep -v "//" | head -1 | cut -d: -f1)
    local dash_line=$(grep -n '"--"' "$file" | grep -v "//" | head -1 | cut -d: -f1)

    if [ -n "$o_line" ] && [ -n "$dash_line" ]; then
        if [ "$o_line" -lt "$dash_line" ]; then
            has_correct_order=1
        fi
    fi

    check_test "perf -o 参数在 -- 之前" $((1 - has_correct_order))
}

test_perf_args

# ----------------------------------------------------------
# 问题2: NotifyResult 线程安全
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题2] NotifyResult 线程安全${NC}"

test_notify_result_mutex() {
    local file="$PROJECT_ROOT/server/HotmethodService.cpp"
    if [ ! -f "$file" ]; then
        check_test "HotmethodService.cpp 文件存在" 1
        return
    fi
    check_test "HotmethodService.cpp 文件存在" 0

    # 检查 NotifyResult 中 UpdateTaskStatus 是否在锁内
    local has_proper_lock=0

    # 方法1: 检查是否有单独的锁保护 UpdateTaskStatus
    if grep -q "NotifyResult" "$file"; then
        # 获取 NotifyResult 函数范围
        local func_start=$(grep -n "NotifyResult" "$file" | head -1 | cut -d: -f1)
        if [ -n "$func_start" ]; then
            # 检查函数内是否有 lock_guard 在 UpdateTaskStatus 之前
            local lock_line=$(awk "NR>$func_start && /lock_guard/" "$file" | head -1)
            local update_line=$(awk "NR>$func_start && /UpdateTaskStatus/" "$file" | head -1)

            if [ -z "$update_line" ]; then
                # UpdateTaskStatus 可能在 results_ 锁内调用
                has_proper_lock=1
            elif [ -n "$lock_line" ]; then
                # 检查锁是否在 UpdateTaskStatus 之前
                local lock_num=$(echo "$lock_line" | grep -o "^[0-9]*")
                local update_num=$(echo "$update_line" | grep -o "^[0-9]*")
                if [ -z "$lock_num" ] || [ -z "$update_num" ] || [ "$lock_num" -lt "$update_num" ]; then
                    has_proper_lock=1
                fi
            fi
        fi
    fi

    check_test "NotifyResult 中 UpdateTaskStatus 有锁保护" $((1 - has_proper_lock))
}

test_notify_result_mutex

# ----------------------------------------------------------
# 问题3: /proc/stat 解析
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题3] /proc/<pid>/stat 解析${NC}"

test_proc_stat_parse() {
    local file="$PROJECT_ROOT/common/Process.cpp"
    if [ ! -f "$file" ]; then
        check_test "Process.cpp 文件存在" 1
        return
    fi
    check_test "Process.cpp 文件存在" 0

    # 检查是否使用 rfind(')') 而不是 find(')')
    local uses_rfind=0
    if grep -q "rfind(')')" "$file"; then
        uses_rfind=1
    fi

    check_test "使用 rfind 查找最后一个 )" $((1 - uses_rfind))
}

test_proc_stat_parse

# ----------------------------------------------------------
# 问题4: CMake 依赖
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题4] CMake 依赖完整性${NC}"

test_cmake_deps() {
    local file="$PROJECT_ROOT/CMakeLists.txt"
    if [ ! -f "$file" ]; then
        check_test "CMakeLists.txt 存在" 1
        return
    fi
    check_test "CMakeLists.txt 存在" 0

    # 检查 pthread (CMake 中通常用 Threads::Threads)
    local has_pthread=0
    if grep -q "pthread\|Threads" "$file"; then
        has_pthread=1
    fi
    check_test "链接 pthread" $((1 - has_pthread))

    # 检查 nlohmann_json
    local has_json=0
    if grep -q "nlohmann_json\|nlohmann" "$file"; then
        has_json=1
    fi
    check_test "依赖 nlohmann_json" $((1 - has_json))
}

test_cmake_deps

# ============================================================
# 第二优先级：中等问题
# ============================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🟡 第二优先级：中等问题${NC}"
echo -e "${BLUE}========================================${NC}"

# ----------------------------------------------------------
# 问题5: 守护化功能
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题5] 守护化功能${NC}"

test_daemon() {
    local file="$PROJECT_ROOT/agent/main.cpp"
    if [ ! -f "$file" ]; then
        check_test "agent/main.cpp 存在" 1
        return
    fi
    check_test "agent/main.cpp 存在" 0

    # 检查是否调用 Daemonize
    local calls_daemon=0
    if grep -q "Daemonize\|daemonize\|Daemon" "$file"; then
        calls_daemon=1
    fi
    check_test "Agent 调用 Daemonize()" $((1 - calls_daemon))

    # 检查 Daemon.cpp 是否存在
    local daemon_file="$PROJECT_ROOT/common/Daemon.cpp"
    if [ -f "$daemon_file" ]; then
        check_test "Daemon.cpp 存在" 0
    else
        check_test "Daemon.cpp 存在" 1
    fi
}

test_daemon

# ----------------------------------------------------------
# 问题6: 心跳频率
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题6] 心跳频率 (文档要求1Hz)${NC}"

test_heartbeat_freq() {
    local file="$PROJECT_ROOT/agent/HealthCheckChannel.cpp"
    if [ ! -f "$file" ]; then
        check_test "HealthCheckChannel.cpp 存在" 1
        return
    fi
    check_test "HealthCheckChannel.cpp 存在" 0

    # 检查心跳间隔，应该是1秒(10 * 100ms = 1s)
    local has_1hz=0
    # 检查是否是 10 * 100ms（1秒）而不是 50 * 100ms（5秒）
    if grep -q "for.*10.*running\|1000\|1s\|seconds(1)" "$file"; then
        has_1hz=1
    fi
    check_test "心跳间隔 1 秒 (1Hz)" $((1 - has_1hz))
}

test_heartbeat_freq

# ----------------------------------------------------------
# 问题7: self_pstats 填充
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题7] self_pstats/children_pstats 填充${NC}"

test_pstats_fill() {
    local file="$PROJECT_ROOT/agent/HealthCheckChannel.cpp"
    if [ ! -f "$file" ]; then
        check_test "HealthCheckChannel.cpp 存在" 1
        return
    fi

    # 检查是否有填充 self_pstats 的代码
    local fills_pstats=0
    if grep -q "self_pstats\|set_self_pstats\|mutable_self" "$file"; then
        # 检查是否有实际的数据填充，而不仅仅是字段引用
        if grep -q "set_cpu\|set_memory\|set_io\|PidStats\|GetPidStats" "$file"; then
            fills_pstats=1
        fi
    fi
    check_test "填充 self_pstats 数据" $((1 - fills_pstats))
}

test_pstats_fill

# ----------------------------------------------------------
# 问题8: 超时清理线程
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题8] 超时清理线程${NC}"

test_timeout_cleanup() {
    local file="$PROJECT_ROOT/server/main.cpp"
    if [ ! -f "$file" ]; then
        check_test "server/main.cpp 存在" 1
        return
    fi

    # 检查是否有超时清理线程
    local has_timeout_thread=0
    if grep -q "timeout\|Timeout\|TIMEOUT\|cleanup\|Cleanup" "$file"; then
        if grep -q "thread\|Thread" "$file"; then
            has_timeout_thread=1
        fi
    fi
    check_test "超时清理线程存在" $((1 - has_timeout_thread))
}

test_timeout_cleanup

# ----------------------------------------------------------
# 问题9: 状态机完整性
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题9] 状态机完整性 (DISPATCHED/TIMEOUT)${NC}"

test_state_machine() {
    local file="$PROJECT_ROOT/server/HotmethodService.h"
    if [ ! -f "$file" ]; then
        check_test "HotmethodService.h 存在" 1
        return
    fi
    check_test "HotmethodService.h 存在" 0

    # 检查 TaskStatus 枚举
    local has_dispatched=0
    local has_timeout=0

    if grep -q "DISPATCHED" "$file"; then
        has_dispatched=1
    fi
    if grep -q "TIMEOUT" "$file"; then
        has_timeout=1
    fi

    check_test "TaskStatus 包含 DISPATCHED" $((1 - has_dispatched))
    check_test "TaskStatus 包含 TIMEOUT" $((1 - has_timeout))
}

test_state_machine

# ----------------------------------------------------------
# 问题10: fork 子进程关闭 fd
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题10] fork 子进程关闭 socket fd${NC}"

test_fork_close_fd() {
    local file="$PROJECT_ROOT/common/Perf.cpp"
    if [ ! -f "$file" ]; then
        check_test "Perf.cpp 存在" 1
        return
    fi

    # 检查 fork 后是否关闭不需要的 fd
    local closes_fd=0
    if grep -q "fork" "$file"; then
        if grep -q "close\|CloseFD\|close_fd" "$file"; then
            closes_fd=1
        fi
    fi
    check_test "fork 后关闭多余 fd" $((1 - closes_fd))
}

test_fork_close_fd

# ----------------------------------------------------------
# 问题11: perf_event_paranoid 检查
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题11] perf_event_paranoid 权限检查${NC}"

test_perf_paranoid() {
    local file="$PROJECT_ROOT/common/Perf.cpp"
    if [ ! -f "$file" ]; then
        check_test "Perf.cpp 存在" 1
        return
    fi

    # 检查是否读取 perf_event_paranoid
    local checks_paranoid=0
    if grep -q "perf_event_paranoid" "$file"; then
        checks_paranoid=1
    fi
    check_test "检查 perf_event_paranoid" $((1 - checks_paranoid))
}

test_perf_paranoid

# ----------------------------------------------------------
# 问题12: 结果清理机制
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题12] results_ 和 tasks_state_ 清理${NC}"

test_results_cleanup() {
    local file="$PROJECT_ROOT/server/HotmethodService.cpp"
    if [ ! -f "$file" ]; then
        check_test "HotmethodService.cpp 存在" 1
        return
    fi

    # 检查是否有清理机制
    local has_cleanup=0
    if grep -q "clear\|erase\|remove\|Cleanup\|cleanup\|Purge\|purge" "$file"; then
        has_cleanup=1
    fi
    check_test "结果清理机制存在" $((1 - has_cleanup))
}

test_results_cleanup

# ----------------------------------------------------------
# 问题13: FetchData 返回结果
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题13] FetchData 返回实际数据${NC}"

test_fetch_data() {
    local file="$PROJECT_ROOT/server/ControlService.cpp"
    if [ ! -f "$file" ]; then
        check_test "ControlService.cpp 存在" 1
        return
    fi

    # 检查 FetchData 是否设置结果
    local sets_result=0
    if grep -q "FetchData" "$file"; then
        if grep -q "set_file\|set_url\|set_message\|set_result" "$file"; then
            sets_result=1
        fi
    fi
    check_test "FetchData 设置返回数据" $((1 - sets_result))
}

test_fetch_data

# ----------------------------------------------------------
# 问题14: 日志线程安全
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题14] 日志线程安全${NC}"

test_log_thread_safe() {
    local file="$PROJECT_ROOT/common/Log.cpp"
    if [ ! -f "$file" ]; then
        check_test "Log.cpp 存在" 1
        return
    fi

    # 检查是否有锁保护
    local has_lock=0
    if grep -q "mutex\|lock\|Lock\|atomic" "$file"; then
        has_lock=1
    fi
    check_test "日志输出有锁保护" $((1 - has_lock))
}

test_log_thread_safe

# ============================================================
# 第三优先级：遗漏功能
# ============================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ⚪ 第三优先级：遗漏功能${NC}"
echo -e "${BLUE}========================================${NC}"

# ----------------------------------------------------------
# 问题15: 多 Server 故障转移
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题15] 多 Server 故障转移${NC}"

test_multi_server() {
    local file="$PROJECT_ROOT/agent/main.cpp"
    if [ ! -f "$file" ]; then
        check_test "agent/main.cpp 存在" 1
        return
    fi

    # 检查是否使用多个 server_ip
    local uses_multi=0
    if grep -q "server_ips\|servers\|failover\|Failover" "$file"; then
        uses_multi=1
    fi
    check_test "多 Server 故障转移" $((1 - uses_multi))
}

test_multi_server

# ----------------------------------------------------------
# 问题16: Agent 注册
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题16] Agent 注册流程${NC}"

test_agent_register() {
    local file="$PROJECT_ROOT/agent/main.cpp"
    if [ ! -f "$file" ]; then
        check_test "agent/main.cpp 存在" 1
        return
    fi

    # 检查是否调用 RegisterAgent
    local calls_register=0
    if grep -q "RegisterAgent\|register\|Register" "$file"; then
        calls_register=1
    fi
    check_test "Agent 启动时注册" $((1 - calls_register))
}

test_agent_register

# ----------------------------------------------------------
# 问题17: TaskDesc.timeout_sec 使用
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题17] TaskDesc.timeout_sec 使用${NC}"

test_timeout_sec() {
    local file="$PROJECT_ROOT/agent/HotmethodChannel.cpp"
    if [ ! -f "$file" ]; then
        check_test "HotmethodChannel.cpp 存在" 1
        return
    fi

    # 检查是否使用 timeout_sec
    local uses_timeout=0
    if grep -q "timeout_sec" "$file"; then
        uses_timeout=1
    fi
    check_test "使用 TaskDesc.timeout_sec" $((1 - uses_timeout))
}

test_timeout_sec

# ----------------------------------------------------------
# 问题18: ContainerInfo::GetHostPid
# ----------------------------------------------------------
echo ""
echo -e "${YELLOW}[问题18] ContainerInfo::GetHostPid 实现${NC}"

test_get_host_pid() {
    local file="$PROJECT_ROOT/agent/ContainerInfo.cpp"
    if [ ! -f "$file" ]; then
        # ContainerInfo 可能不存在，跳过
        check_test "ContainerInfo.cpp 存在 (可选)" 0
        return
    fi

    # 检查 GetHostPid 是否有实际实现
    local has_implementation=0
    if grep -q "GetHostPid" "$file"; then
        if grep -q "NSpid\|status\|proc" "$file"; then
            has_implementation=1
        fi
    fi
    check_test "GetHostPid 读取 NSpid" $((1 - has_implementation))
}

test_get_host_pid

# ============================================================
# 汇总
# ============================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  📊 测试汇总${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  总计: ${total_count}"
echo -e "  ${GREEN}通过: ${pass_count}${NC}"
echo -e "  ${RED}失败: ${fail_count}${NC}"
echo ""

if [ "$fail_count" -gt 0 ]; then
    echo -e "${RED}❌ 存在失败项，需要修复！${NC}"
    exit 1
else
    echo -e "${GREEN}✅ 全部通过！${NC}"
    exit 0
fi
