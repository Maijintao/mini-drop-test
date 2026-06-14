#!/bin/bash
# 存储客户端测试
# 检查 StorageClient 实现是否符合复刻指南（无 system() 调用）

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

assert_not_contains() {
    local test_name="$1"
    local pattern="$2"
    local file="$3"
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        ((pass_count++))
    else
        echo -e "  ${RED}✗${NC} $test_name ('$pattern' found but should not)"
        ((fail_count++))
    fi
}

echo "=========================================="
echo "  存储客户端测试"
echo "=========================================="
echo ""

HEADER="$PROJECT_DIR/common/StorageClient.h"
IMPL="$PROJECT_DIR/common/StorageClient.cpp"

# ============================================
# 接口定义检查
# ============================================
echo "[接口定义]"

assert_contains "头文件保护" 'pragma once' "$HEADER"
assert_contains "StorageClient 基类" 'class StorageClient' "$HEADER"
assert_contains "虚析构函数" 'virtual ~StorageClient' "$HEADER"
assert_contains "Upload 纯虚方法" 'virtual int Upload.*= 0' "$HEADER"
assert_contains "Download 纯虚方法" 'virtual int Download.*= 0' "$HEADER"
assert_contains "Exists 纯虚方法" 'virtual bool Exists.*= 0' "$HEADER"
assert_contains "GetPresignedUrl 纯虚方法" 'virtual std::string GetPresignedUrl.*= 0' "$HEADER"
assert_contains "MinIOClient 实现类" 'class MinIOClient' "$HEADER"
echo ""

# ============================================
# MinIOClient 实现检查
# ============================================
echo "[MinIOClient 实现]"

assert_contains "构造函数" 'MinIOClient::MinIOClient' "$IMPL"
assert_contains "Upload 实现" 'MinIOClient::Upload' "$IMPL"
assert_contains "Download 实现" 'MinIOClient::Download' "$IMPL"
assert_contains "Exists 实现" 'MinIOClient::Exists' "$IMPL"
assert_contains "GetPresignedUrl 实现" 'MinIOClient::GetPresignedUrl' "$IMPL"
echo ""

# ============================================
# 安全性检查（无 system() 调用）
# ============================================
echo "[安全性检查]"

assert_not_contains "无 system() 调用" 'system(' "$IMPL"
assert_contains "使用 fork" 'fork()' "$IMPL"
assert_contains "使用 execvp" 'execvp' "$IMPL"
assert_contains "使用 waitpid" 'waitpid' "$IMPL"
echo ""

# ============================================
# 超时保护检查
# ============================================
echo "[超时保护]"

assert_contains "ExecCommand 辅助函数" 'static int ExecCommand' "$IMPL"
assert_contains "超时参数" 'timeout_sec' "$IMPL"
assert_contains "SIGTERM 信号" 'SIGTERM' "$IMPL"
assert_contains "SIGKILL 信号" 'SIGKILL' "$IMPL"
assert_contains "进程组操作" 'killpg' "$IMPL"
assert_contains "setpgid 调用" 'setpgid' "$IMPL"
echo ""

# ============================================
# mc 命令调用检查
# ============================================
echo "[mc 命令调用]"

assert_contains "mc alias set 初始化" 'mc.*alias.*set' "$IMPL"
assert_contains "mc cp 上传" 'mc.*cp' "$IMPL"
assert_contains "mc stat 检查" 'mc.*stat' "$IMPL"
echo ""

# ============================================
# 配置参数检查
# ============================================
echo "[配置参数]"

assert_contains "endpoint 参数" 'endpoint_' "$IMPL"
assert_contains "access_key 参数" 'access_key_' "$IMPL"
assert_contains "secret_key 参数" 'secret_key_' "$IMPL"
assert_contains "bucket 参数" 'bucket_' "$IMPL"
assert_contains "use_ssl 参数" 'use_ssl_' "$IMPL"
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
