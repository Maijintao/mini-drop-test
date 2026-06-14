#!/bin/bash
# 守护进程化测试
# 检查 Daemon 实现是否符合复刻指南（fork → setsid → fork → 关 fd）

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

echo "=========================================="
echo "  守护进程化测试"
echo "=========================================="
echo ""

DAEMON="$PROJECT_DIR/common/Daemon.cpp"

# ============================================
# 守护化进程化流程检查
# ============================================
echo "[守护化进程化流程]"

assert_contains "第一次 fork" 'fork()' "$DAEMON"
assert_contains "父进程退出" '_exit(0)' "$DAEMON"
assert_contains "setsid 调用" 'setsid()' "$DAEMON"
assert_contains "第二次 fork" 'fork()' "$DAEMON"
assert_contains "设置 umask" 'umask(0)' "$DAEMON"
assert_contains "切换根目录" 'chdir("/")' "$DAEMON"
echo ""

# ============================================
# 文件描述符处理检查
# ============================================
echo "[文件描述符处理]"

assert_contains "关闭 STDIN" 'close(STDIN_FILENO)' "$DAEMON"
assert_contains "关闭 STDOUT" 'close(STDOUT_FILENO)' "$DAEMON"
assert_contains "关闭 STDERR" 'close(STDERR_FILENO)' "$DAEMON"
assert_contains "重定向 stdin" 'open.*O_RDONLY' "$DAEMON"
assert_contains "重定向 stdout" 'open.*O_WRONLY' "$DAEMON"
assert_contains "重定向 stderr" 'open.*O_WRONLY' "$DAEMON"
echo ""

# ============================================
# 错误处理检查
# ============================================
echo "[错误处理]"

assert_contains "fork 失败处理" 'fork failed' "$DAEMON"
assert_contains "setsid 失败处理" 'setsid failed' "$DAEMON"
assert_contains "chdir 失败处理" 'chdir failed' "$DAEMON"
echo ""

# ============================================
# 头文件检查
# ============================================
echo "[头文件]"

assert_contains "unistd.h" '#include <unistd.h>' "$DAEMON"
assert_contains "sys/stat.h" '#include <sys/stat.h>' "$DAEMON"
assert_contains "fcntl.h" '#include <fcntl.h>' "$DAEMON"
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
