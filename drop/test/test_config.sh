#!/bin/bash
# 配置加载测试
# 检查 Config 和配置文件是否符合复刻指南

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

echo "=========================================="
echo "  配置加载测试"
echo "=========================================="
echo ""

# ============================================
# Config 结构体检查
# ============================================
echo "[Config 结构体]"

CONFIG_H="$PROJECT_DIR/agent/Config.h"

assert_contains "头文件保护" 'pragma once' "$CONFIG_H"
assert_contains "Config 结构体" 'struct Config' "$CONFIG_H"
assert_contains "uid 字段" 'std::string uid' "$CONFIG_H"
assert_contains "ip_addr 字段" 'std::string ip_addr' "$CONFIG_H"
assert_contains "server_ips 字段" 'std::vector.*server_ips' "$CONFIG_H"
assert_contains "server_port 字段" 'int server_port' "$CONFIG_H"
assert_contains "storage_endpoint 字段" 'std::string storage_endpoint' "$CONFIG_H"
assert_contains "storage_access_key 字段" 'std::string storage_access_key' "$CONFIG_H"
assert_contains "storage_secret_key 字段" 'std::string storage_secret_key' "$CONFIG_H"
assert_contains "storage_bucket 字段" 'std::string storage_bucket' "$CONFIG_H"
assert_contains "storage_use_ssl 字段" 'bool storage_use_ssl' "$CONFIG_H"
assert_contains "LoadFromFile 静态方法" 'static Config LoadFromFile' "$CONFIG_H"
echo ""

# ============================================
# Config 实现检查
# ============================================
echo "[Config 实现]"

CONFIG_CPP="$PROJECT_DIR/agent/Config.cpp"

assert_contains "LoadFromFile 实现" 'Config Config::LoadFromFile' "$CONFIG_CPP"
assert_contains "使用 nlohmann::json" 'nlohmann::json' "$CONFIG_CPP"
assert_contains "读取 uid" 'j.value("uid"' "$CONFIG_CPP"
assert_contains "读取 ip_addr" 'j.value("ip_addr"' "$CONFIG_CPP"
assert_contains "读取 server_port" 'j.value("server_port"' "$CONFIG_CPP"
assert_contains "读取 server_ips 数组" 'j.contains("server_ips")' "$CONFIG_CPP"
assert_contains "读取 storage 配置" 'j.contains("storage")' "$CONFIG_CPP"
assert_contains "错误处理" 'Failed to open config' "$CONFIG_CPP"
assert_contains "JSON 解析错误处理" 'json::parse_error' "$CONFIG_CPP"
echo ""

# ============================================
# 配置文件示例检查
# ============================================
echo "[配置文件示例]"

CONFIG_EXAMPLE="$PROJECT_DIR/etc/config.json.example"

if [ -f "$CONFIG_EXAMPLE" ]; then
    assert_eq "配置文件存在" "true" "true"

    # 检查 JSON 格式
    if python3 -c "import json; json.load(open('$CONFIG_EXAMPLE'))" 2>/dev/null; then
        assert_eq "JSON 格式正确" "true" "true"
    else
        assert_eq "JSON 格式正确" "true" "false"
    fi

    # 检查必要字段
    assert_contains "uid 字段" '"uid"' "$CONFIG_EXAMPLE"
    assert_contains "ip_addr 字段" '"ip_addr"' "$CONFIG_EXAMPLE"
    assert_contains "server_ips 字段" '"server_ips"' "$CONFIG_EXAMPLE"
    assert_contains "server_port 字段" '"server_port"' "$CONFIG_EXAMPLE"
    assert_contains "storage 字段" '"storage"' "$CONFIG_EXAMPLE"
    assert_contains "storage.endpoint" '"endpoint"' "$CONFIG_EXAMPLE"
    assert_contains "storage.access_key" '"access_key"' "$CONFIG_EXAMPLE"
    assert_contains "storage.secret_key" '"secret_key"' "$CONFIG_EXAMPLE"
    assert_contains "storage.bucket" '"bucket"' "$CONFIG_EXAMPLE"
else
    assert_eq "配置文件存在" "true" "false"
fi
echo ""

# ============================================
# 多 Server 故障转移检查
# ============================================
echo "[多 Server 故障转移]"

assert_contains "server_ips 是数组" 'std::vector.*server_ips' "$CONFIG_H"
assert_contains "遍历 server_ips" 'for.*server_ips' "$CONFIG_CPP"
echo ""

# ============================================
# Agent main.cpp 配置使用检查
# ============================================
echo "[Agent 配置使用]"

MAIN_CPP="$PROJECT_DIR/agent/main.cpp"

assert_contains "加载配置文件" 'Config::LoadFromFile' "$MAIN_CPP"
assert_contains "使用 config.server_ips" 'config.server_ips' "$MAIN_CPP"
assert_contains "使用 config.uid" 'config.uid' "$MAIN_CPP"
assert_contains "使用 config.ip_addr" 'config.ip_addr' "$MAIN_CPP"
assert_contains "传递 config 给 HotmethodChannel" 'HotmethodChannel.*config' "$MAIN_CPP"
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
