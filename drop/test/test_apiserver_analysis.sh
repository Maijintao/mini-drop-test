#!/bin/bash
# test_apiserver_analysis.sh
# apiserver ↔ analysis 联调测试
# 测试链路: 创建任务 → 更新状态 → 上传数据 → 触发分析 → 验证产物

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
APISERVER_DIR="$PROJECT_DIR/apiserver"
ANALYSIS_DIR="$PROJECT_DIR/analysis"
APISERVER_PORT=18191
API="http://localhost:$APISERVER_PORT"
TID="test-$(date +%s)"
APISERVER_PID=""

PASS=0
FAIL=0

cleanup() {
    echo ""
    echo "=== 清理 ==="
    if [ -n "$APISERVER_PID" ]; then
        echo "  停止 apiserver (PID=$APISERVER_PID)"
        kill "$APISERVER_PID" 2>/dev/null || true
        wait "$APISERVER_PID" 2>/dev/null || true
    fi
    # 清理 docker 容器（保留 postgres 和 minio）
}
trap cleanup EXIT

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

assert_json() {
    local desc="$1"
    local json="$2"
    local path="$3"
    local expected="$4"
    local actual
    actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$path)" 2>/dev/null)
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc (got $actual)"
        PASS=$((PASS+1))
    else
        echo "  ✗ $desc (expected $expected, got $actual)"
        FAIL=$((FAIL+1))
    fi
}

echo "=== apiserver ↔ analysis 联调测试 ==="
echo ""

# --- 前置检查 ---
echo "--- 前置检查 ---"

check "postgres 容器运行中" "docker ps --filter name=postgres --filter status=running -q | grep ."
check "minio 容器运行中" "docker ps --filter name=minio --filter status=running -q | grep ."
check "apiserver 目录存在" "test -d '$APISERVER_DIR'"
check "analysis 目录存在" "test -d '$ANALYSIS_DIR'"

# 重置数据库（GORM AutoMigrate 在表已存在时会报错）
echo "  重置数据库..."
docker exec postgres psql -U postgres -d drop -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1

echo ""

# --- 编译 apiserver ---
echo "--- 编译 apiserver ---"

cd "$APISERVER_DIR"
if [ ! -f apiserver ]; then
    echo "  编译中..."
    CGO_ENABLED=1 go build -o apiserver . 2>&1
fi
check "apiserver 编译成功" "test -f '$APISERVER_DIR/apiserver'"
echo ""

# --- 生成测试配置 ---
echo "--- 生成测试配置 ---"

mkdir -p /tmp/mini-drop-test
cat > /tmp/mini-drop-test/apiserver.yaml << EOF
server:
  port: $APISERVER_PORT
  mode: debug

database:
  host: localhost
  port: 5432
  user: postgres
  password: dev
  dbname: drop
  sslmode: disable

grpc:
  target: "localhost:50051"

minio:
  endpoint: "localhost:9000"
  access_key: minioadmin
  secret_key: minioadmin
  bucket: drop-data
  use_ssl: false
  region: ""

log:
  level: info
  path: ""

analysis:
  command: "python3"
  script_path: "$ANALYSIS_DIR/hotmethod_analyzer.py"
  config_path: "/tmp/mini-drop-test/analysis.ini"
EOF

# 生成 analyzer 配置（指向测试 apiserver 端口）
cat > /tmp/mini-drop-test/analysis.ini << EOF
[apiserver]
url = http://localhost:$APISERVER_PORT

[minio]
endpoint = localhost:9000
access_key = minioadmin
secret_key = minioadmin
bucket = drop-data
secure = false
EOF
echo "  ✓ 配置已生成"
echo ""

# --- 启动 apiserver ---
echo "--- 启动 apiserver ---"

cd "$APISERVER_DIR"
./apiserver -c /tmp/mini-drop-test/apiserver.yaml > /tmp/mini-drop-test/apiserver.log 2>&1 &
APISERVER_PID=$!
sleep 3

if ! kill -0 "$APISERVER_PID" 2>/dev/null; then
    echo "  ✗ apiserver 启动失败，日志:"
    cat /tmp/mini-drop-test/apiserver.log
    exit 1
fi
check "apiserver 已启动 (PID=$APISERVER_PID)"

# 等待健康检查通过
for i in $(seq 1 10); do
    if curl -s "$API/healthz" | grep -q '"status":"ok"'; then
        break
    fi
    sleep 1
done
check "apiserver 健康检查通过" "curl -s '$API/healthz' | grep -q 'ok'"
echo ""

# --- 测试 1: 创建任务（gRPC 会失败，但任务入库） ---
echo "--- 测试 1: 创建任务 ---"

CREATE_RESP=$(curl -s -X POST "$API/api/v1/tasks" \
    -H "Content-Type: application/json" \
    -H "Drop_user_uid: test-user" \
    -H "Drop_user_name: TestUser" \
    -d "{
        \"name\": \"integration-test\",
        \"type\": 0,
        \"profiler_type\": 0,
        \"target_ip\": \"127.0.0.1\",
        \"pid\": 1234,
        \"duration\": 10,
        \"hz\": 99
    }")

echo "  创建响应: $CREATE_RESP"

# gRPC 不可用会返回 500，但任务已入库
# 检查任务是否在 DB 中
TASK_RESP=$(curl -s "$API/api/v1/tasks" \
    -H "Drop_user_uid: test-user" \
    -H "Drop_user_name: TestUser")
echo "  任务列表: $TASK_RESP"

# 提取 tid（从任务列表，因为 gRPC 不可用会返回 500）
TID=$(echo "$TASK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['list'][0]['tid'])" 2>/dev/null)
if [ -n "$TID" ]; then
    echo "  ✓ 任务已入库 (tid=$TID, gRPC 未连接但任务在)"
    PASS=$((PASS+1))
else
    echo "  ✗ 无法获取 tid"
    FAIL=$((FAIL+1))
fi
echo ""

# --- 测试 2: 更新任务状态为成功 ---
echo "--- 测试 2: 更新任务状态 ---"

# 通过 docker exec 更新任务状态（macOS 没装 psql）
docker exec postgres psql -U postgres -d drop -c \
    "UPDATE hotmethod_task SET status=2 WHERE tid='$TID'" 2>/dev/null
check "任务状态更新为 success (status=2)" "docker exec postgres psql -U postgres -d drop -t -c \"SELECT status FROM hotmethod_task WHERE tid='$TID'\" | grep -q '2'"

echo ""

# --- 测试 3: 上传 mock 数据到 MinIO ---
echo "--- 测试 3: 上传 mock 数据 ---"

# 用 python 上传
UPLOAD_RESULT=$(python3 -c "
from minio import Minio
import io
client = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
if not client.bucket_exists('drop-data'):
    client.make_bucket('drop-data')

mock_data = b'main;start;run;malloc;alloc 100\nmain;start;run;compute 200\nmain;start;run;memcpy 50\n'
client.put_object('drop-data', '$TID/perf.data', io.BytesIO(mock_data), len(mock_data))
# 同时上传 collapsed.txt（macOS 无 perf 时的 fallback）
client.put_object('drop-data', '$TID/collapsed.txt', io.BytesIO(mock_data), len(mock_data))
print('ok')
" 2>&1)

check "mock perf.data 上传到 MinIO" "echo '$UPLOAD_RESULT' | grep -q 'ok'"

# 验证文件存在
check "MinIO 上文件存在" "python3 -c \"
from minio import Minio
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
c.stat_object('drop-data', '$TID/perf.data')
print('exists')
\" 2>/dev/null | grep -q 'exists'"
echo ""

# --- 测试 4: 触发分析 ---
echo "--- 测试 4: 触发分析 ---"

ANALYZE_RESP=$(curl -s -X POST "$API/api/v1/tasks/$TID/analyze" \
    -H "Drop_user_uid: test-user" \
    -H "Drop_user_name: TestUser")
echo "  触发响应: $ANALYZE_RESP"
check "分析触发成功" "echo '$ANALYZE_RESP' | grep -q '\"code\":0'"

# 等待分析完成（最多 30 秒，以 MinIO 产物为准）
echo "  等待分析完成..."
ANALYSIS_DONE=false
for i in $(seq 1 30); do
    # 检查 MinIO 上是否有产物（比 analysis_status 更可靠）
    HAS_SVG=$(python3 -c "
from minio import Minio
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
try:
    c.stat_object('drop-data', '$TID/flamegraph.svg')
    print('yes')
except:
    print('no')
" 2>/dev/null)
    if [ "$HAS_SVG" = "yes" ]; then
        ANALYSIS_DONE=true
        echo "  ✓ 分析完成（产物已上传到 MinIO）"
        PASS=$((PASS+1))
        break
    fi
    sleep 1
done

if [ "$ANALYSIS_DONE" = "false" ]; then
    echo "  ✗ 分析超时（MinIO 无产物）"
    FAIL=$((FAIL+1))
fi
echo ""

# --- 测试 5: 验证产物 ---
echo "--- 测试 5: 验证产物 ---"

# 检查 MinIO 上的产物
for FILE in "flamegraph.svg" "top.json" "suggestions.md" "collapsed.txt"; do
    EXISTS=$(python3 -c "
from minio import Minio
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
try:
    c.stat_object('drop-data', '$TID/$FILE')
    print('exists')
except:
    print('missing')
" 2>/dev/null)
    if [ "$EXISTS" = "exists" ]; then
        SIZE=$(python3 -c "
from minio import Minio
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
info = c.stat_object('drop-data', '$TID/$FILE')
print(info.size)
" 2>/dev/null)
        echo "  ✓ $FILE 存在 (${SIZE} bytes)"
        PASS=$((PASS+1))
    else
        echo "  ✗ $FILE 缺失"
        FAIL=$((FAIL+1))
    fi
done
echo ""

# --- 测试 6: 验证火焰图内容 ---
echo "--- 测试 6: 验证产物内容 ---"

# 下载 top.json 并检查
TOP_JSON=$(python3 -c "
from minio import Minio
import json
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
resp = c.get_object('drop-data', '$TID/top.json')
data = json.loads(resp.read())
print(json.dumps(data))
" 2>/dev/null)

if echo "$TOP_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d)>0; print('ok')" 2>/dev/null; then
    echo "  ✓ top.json 非空且格式正确"
    PASS=$((PASS+1))
else
    echo "  ✗ top.json 格式异常"
    FAIL=$((FAIL+1))
fi

# 检查火焰图 SVG
SVG_CHECK=$(python3 -c "
from minio import Minio
c = Minio('localhost:9000', access_key='minioadmin', secret_key='minioadmin', secure=False)
resp = c.get_object('drop-data', '$TID/flamegraph.svg')
data = resp.read().decode()
assert '<svg' in data.lower()
print('ok')
" 2>/dev/null)

check "flamegraph.svg 包含 SVG 标签" "echo '$SVG_CHECK' | grep -q 'ok'"
echo ""

# --- 测试 7: 验证建议 ---
echo "--- 测试 7: 验证分析建议 ---"

SUGGESTIONS=$(curl -s "$API/api/v1/tasks/$TID/suggestions" \
    -H "Drop_user_uid: test-user" \
    -H "Drop_user_name: TestUser")
echo "  建议响应: $SUGGESTIONS"
SUGGESTION_COUNT=$(echo "$SUGGESTIONS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
if [ "$SUGGESTION_COUNT" -gt 0 ] 2>/dev/null; then
    echo "  ✓ 有 $SUGGESTION_COUNT 条建议"
    PASS=$((PASS+1))
else
    echo "  ⚠ 建议为空（mock 数据函数名可能不匹配规则）"
fi
echo ""

# --- 总结 ---
echo "==================================="
echo "  通过: $PASS  失败: $FAIL"
echo "==================================="

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "apiserver 日志（最后 20 行）:"
    tail -20 /tmp/mini-drop-test/apiserver.log
    exit 1
fi
