#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${API_BASE_URL:-http://localhost:8191/api/v1}"
WEB="${WEB_URL:-http://localhost}"
USER="${DEMO_USER:-demo}"
PASS="${DEMO_PASS:-demo1234}"
DURATION="${DEMO_DURATION:-5}"
HZ="${DEMO_HZ:-49}"

cd "$ROOT_DIR"

echo "[demo] starting services"
docker compose down --remove-orphans
docker compose up -d --build

wait_http() {
  local url="$1"
  local name="$2"
  local deadline=$((SECONDS + 180))
  until curl -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS > deadline )); then
      echo "[demo] timeout waiting for $name at $url" >&2
      docker compose ps >&2 || true
      exit 1
    fi
    sleep 2
  done
}

wait_http "$API/healthz" "apiserver"
wait_http "$WEB" "web"

echo "[demo] login/register demo user"
register_body="{\"username\":\"$USER\",\"password\":\"$PASS\"}"
curl -fsS -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "$register_body" >/tmp/mini_drop_register.json 2>/dev/null || true
curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "$register_body" >/tmp/mini_drop_login.json

read -r DEMO_UID TOKEN < <(python3 -c 'import json; d=json.load(open("/tmp/mini_drop_login.json"))["data"]; print(d["uid"], d.get("token",""))')
AUTH_HEADERS=(-H "Drop_user_uid: $DEMO_UID" -H "Drop_user_name: $USER")
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADERS+=(-H "Drop_user_token: $TOKEN")
fi

echo "[demo] waiting for online agent"
AGENT_IP=""
deadline=$((SECONDS + 180))
while [[ -z "$AGENT_IP" ]]; do
  curl -fsS "${AUTH_HEADERS[@]}" "$API/agents" >/tmp/mini_drop_agents.json
  AGENT_IP="$(python3 -c 'import json; d=json.load(open("/tmp/mini_drop_agents.json")).get("data", []); print(next((a.get("ip_addr","") for a in d if a.get("online")), ""))')"
  if [[ -n "$AGENT_IP" ]]; then
    break
  fi
  if (( SECONDS > deadline )); then
    echo "[demo] no online agent after 180s" >&2
    cat /tmp/mini_drop_agents.json >&2
    docker compose logs --tail=120 drop-agent drop-server >&2 || true
    exit 1
  fi
  sleep 3
done
echo "[demo] using agent $AGENT_IP"

python3 -c 'import time; end=time.time()+300; x=0
while time.time() < end:
    x = (x * 1664525 + 1013904223) & 0xffffffff' &
TARGET_PID=$!
cleanup() {
  kill "$TARGET_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[demo] creating CPU profiling task for pid=$TARGET_PID"
task_body="$(AGENT_IP="$AGENT_IP" TARGET_PID="$TARGET_PID" DURATION="$DURATION" HZ="$HZ" python3 -c 'import json,os; print(json.dumps({"name":"demo-cpu","type":0,"profiler_type":0,"target_ip":os.environ["AGENT_IP"],"pid":int(os.environ["TARGET_PID"]),"duration":int(os.environ["DURATION"]),"hz":int(os.environ["HZ"]),"callgraph":"dwarf","event":"cpu-cycles"}))' )"
curl -fsS -X POST "$API/tasks" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$task_body" >/tmp/mini_drop_task.json
TID="$(python3 -c 'import json; print(json.load(open("/tmp/mini_drop_task.json"))["data"]["tid"])')"
echo "[demo] task id=$TID"

echo "[demo] waiting for task completion"
deadline=$((SECONDS + DURATION + 180))
STATUS=""
while true; do
  curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$TID" >/tmp/mini_drop_task_detail.json
  STATUS="$(python3 -c 'import json; print(json.load(open("/tmp/mini_drop_task_detail.json"))["data"]["task"]["status"])')"
  if [[ "$STATUS" == "4" ]]; then
    break
  fi
  if [[ "$STATUS" == "5" || "$STATUS" == "6" ]]; then
    echo "[demo] task failed" >&2
    cat /tmp/mini_drop_task_detail.json >&2
    exit 1
  fi
  if (( SECONDS > deadline )); then
    echo "[demo] timeout waiting for task completion" >&2
    cat /tmp/mini_drop_task_detail.json >&2
    exit 1
  fi
  sleep 3
done

echo "[demo] waiting for analysis and renderable flamegraph data"
deadline=$((SECONDS + 180))
while true; do
  curl -fsS "${AUTH_HEADERS[@]}" "$API/cosfiles?tid=$TID" >/tmp/mini_drop_files.json
  if python3 -c 'import json,sys; files=json.load(open("/tmp/mini_drop_files.json")).get("data", []); names=[f.get("key","").split("/")[-1] for f in files]; sys.exit(0 if ("collapsed.txt" in names or "top.json" in names) else 1)'; then
    break
  fi
  curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$TID" >/tmp/mini_drop_task_detail.json
  ASTATUS="$(python3 -c 'import json; print(json.load(open("/tmp/mini_drop_task_detail.json"))["data"]["task"].get("analysis_status"))')"
  if [[ "$ASTATUS" == "3" ]]; then
    echo "[demo] analysis failed" >&2
    cat /tmp/mini_drop_task_detail.json >&2
    exit 1
  fi
  if (( SECONDS > deadline )); then
    echo "[demo] timeout waiting for collapsed.txt/top.json" >&2
    cat /tmp/mini_drop_files.json >&2
    exit 1
  fi
  sleep 3
done

echo "[demo] OK"
echo "[demo] Web: $WEB/task/result?tid=$TID"
