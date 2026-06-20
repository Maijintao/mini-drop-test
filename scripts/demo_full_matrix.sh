#!/usr/bin/env bash
set -euo pipefail

API="${API_BASE_URL:-http://localhost:8191/api/v1}"
WEB="${WEB_URL:-http://localhost}"
USER="${DEMO_USER:-demo}"
PASS="${DEMO_PASS:-demo1234}"
DURATION="${DEMO_DURATION:-10}"
HZ="${DEMO_HZ:-99}"
CONTINUOUS_WINDOW="${DEMO_CONTINUOUS_WINDOW:-15}"
DOCKER="${DOCKER:-docker}"
cp_tid=""

if ! $DOCKER ps >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

wait_http() {
  local url="$1"
  local name="$2"
  local deadline=$((SECONDS + 180))
  until curl -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS > deadline )); then
      echo "[matrix] timeout waiting for $name at $url" >&2
      exit 1
    fi
    sleep 2
  done
}

json_get() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$1" "$2"
}

auth() {
  local body="{\"username\":\"$USER\",\"password\":\"$PASS\"}"
  curl -fsS -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_register.json 2>/dev/null || true
  curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_login.json
  read -r DEMO_UID TOKEN < <(python3 -c 'import json; d=json.load(open("/tmp/mini_drop_login.json"))["data"]; print(d["uid"], d.get("token",""))')
  AUTH_HEADERS=(-H "Drop_user_uid: $DEMO_UID" -H "Drop_user_name: $USER")
  if [[ -n "$TOKEN" ]]; then
    AUTH_HEADERS+=(-H "Drop_user_token: $TOKEN")
  fi
}

agent_ip() {
  local deadline=$((SECONDS + 180))
  while true; do
    curl -fsS "${AUTH_HEADERS[@]}" "$API/agents" >/tmp/mini_drop_agents.json
    AGENT_IP="$(python3 -c 'import json; d=json.load(open("/tmp/mini_drop_agents.json")).get("data", []); print(next((a.get("ip_addr","") for a in d if a.get("online")), ""))')"
    if [[ -n "$AGENT_IP" ]]; then
      echo "$AGENT_IP"
      return
    fi
    if (( SECONDS > deadline )); then
      echo "[matrix] no online agent" >&2
      cat /tmp/mini_drop_agents.json >&2
      exit 1
    fi
    sleep 3
  done
}

start_python_target() {
  $DOCKER exec drop-agent sh -c 'cat >/tmp/mini_drop_py_target.py <<'"'"'PY'"'"'
import time
buf = []
end = time.time() + 1800
while time.time() < end:
    buf.append(bytearray(4096))
    if len(buf) > 2000:
        buf = buf[-1000:]
    x = 0
    for i in range(20000):
        x = (x * 1664525 + i) & 0xffffffff
    time.sleep(0.01)
PY
nohup python3 /tmp/mini_drop_py_target.py >/tmp/mini_drop_py_target.log 2>&1 &
echo $! >/tmp/mini_drop_py_target.pid'
  $DOCKER exec drop-agent cat /tmp/mini_drop_py_target.pid
}

start_java_target() {
  $DOCKER exec drop-agent sh -c 'cat >/tmp/MiniDropJavaTarget.java <<'"'"'JAVA'"'"'
public class MiniDropJavaTarget {
  static byte[][] holder = new byte[2048][];
  public static void main(String[] args) throws Exception {
    long end = System.currentTimeMillis() + 1800_000L;
    int slot = 0;
    while (System.currentTimeMillis() < end) {
      holder[slot++ % holder.length] = new byte[8192];
      double x = 0;
      for (int i = 0; i < 30000; i++) x += Math.sqrt(i + slot);
      Thread.sleep(10);
    }
  }
}
JAVA
javac /tmp/MiniDropJavaTarget.java
nohup java -XX:+StartAttachListener -cp /tmp MiniDropJavaTarget >/tmp/mini_drop_java_target.log 2>&1 &
echo $! >/tmp/mini_drop_java_target.pid'
  $DOCKER exec drop-agent cat /tmp/mini_drop_java_target.pid
}

start_pprof_target() {
  if $DOCKER ps --format '{{.Names}}' | grep -qx pprof-target; then
    return
  fi
  $DOCKER run -d --name pprof-target --network host --entrypoint sh mini-drop-vm/apiserver:verify -c 'cat >/tmp/pprof_target.go <<'"'"'GO'"'"'
package main
import (
  _ "net/http/pprof"
  "net/http"
  "time"
)
var sink [][]byte
func burn() {
  for {
    b := make([]byte, 64*1024)
    sink = append(sink, b)
    if len(sink) > 2048 { sink = sink[len(sink)-1024:] }
    x := 0
    for i := 0; i < 500000; i++ { x = (x*1664525 + i) & 0x7fffffff }
    time.Sleep(5 * time.Millisecond)
  }
}
func main() {
  go burn()
  _ = http.ListenAndServe("127.0.0.1:6060", nil)
}
GO
go run /tmp/pprof_target.go'
  local deadline=$((SECONDS + 60))
  until curl -fsS http://127.0.0.1:6060/debug/pprof/ >/dev/null 2>&1; do
    if (( SECONDS > deadline )); then
      echo "[matrix] pprof target did not become ready" >&2
      $DOCKER logs --tail=80 pprof-target >&2 || true
      exit 1
    fi
    sleep 1
  done
}

create_task() {
  local name="$1"
  local type="$2"
  local profiler="$3"
  local pid="$4"
  local event="$5"
  local body
  body="$(NAME="$name" TYPE="$type" PROFILER="$profiler" PID="$pid" EVENT="$event" AGENT_IP="$AGENT_IP" DURATION="$DURATION" HZ="$HZ" python3 - <<'PY'
import json, os
print(json.dumps({
  "name": os.environ["NAME"],
  "type": int(os.environ["TYPE"]),
  "profiler_type": int(os.environ["PROFILER"]),
  "target_ip": os.environ["AGENT_IP"],
  "pid": int(os.environ["PID"]),
  "duration": int(os.environ["DURATION"]),
  "hz": int(os.environ["HZ"]),
  "callgraph": "dwarf",
  "event": os.environ["EVENT"],
}))
PY
)"
  curl -fsS -X POST "$API/tasks" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_create_task.json
  json_get /tmp/mini_drop_create_task.json 'd["data"]["tid"]'
}

nl_plan_case() {
  local label="$1"
  local text="$2"
  local expected_type="$3"
  local expected_profiler="$4"
  local body
  body="$(TEXT="$text" AGENT_IP="$AGENT_IP" python3 - <<'PY'
import json, os
print(json.dumps({
  "text": os.environ["TEXT"],
  "target_ip": os.environ["AGENT_IP"],
}))
PY
)"
  curl -fsS -X POST "$API/tasks/nl" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_nl_plan.json
  python3 - "$expected_type" "$expected_profiler" <<'PY'
import json, sys
d = json.load(open("/tmp/mini_drop_nl_plan.json"))
plan = d["data"]["plan"]
if int(plan["type"]) != int(sys.argv[1]) or int(plan["profiler_type"]) != int(sys.argv[2]):
    raise SystemExit(f"unexpected plan: {plan}")
PY
  echo "[matrix] PASS NL plan $label"
}

create_nl_task() {
  local text="$1"
  local body
  body="$(TEXT="$text" AGENT_IP="$AGENT_IP" python3 - <<'PY'
import json, os
print(json.dumps({
  "text": os.environ["TEXT"],
  "target_ip": os.environ["AGENT_IP"],
  "execute": True,
}))
PY
)"
  curl -fsS -X POST "$API/tasks/nl" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_nl_create.json
  json_get /tmp/mini_drop_nl_create.json 'd["data"]["tid"]'
}

create_continuous() {
  local pid="$1"
  local body
  body="$(AGENT_IP="$AGENT_IP" PID="$pid" WINDOW="$CONTINUOUS_WINDOW" HZ="$HZ" python3 - <<'PY'
import json, os
print(json.dumps({
  "name": "matrix-continuous",
  "target_ip": os.environ["AGENT_IP"],
  "pid": int(os.environ["PID"]),
  "hz": int(os.environ["HZ"]),
  "window_sec": int(os.environ["WINDOW"]),
  "profiler_type": 0,
  "callgraph": "dwarf",
  "event": "cpu-cycles",
}))
PY
)"
  curl -fsS -X POST "$API/tasks/continuous" "${AUTH_HEADERS[@]}" -H 'Content-Type: application/json' -d "$body" >/tmp/mini_drop_create_continuous.json
  json_get /tmp/mini_drop_create_continuous.json 'd["data"]["tid"]'
}

wait_task() {
  local tid="$1"
  local label="$2"
  local deadline=$((SECONDS + 360))
  while true; do
    curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$tid" >/tmp/mini_drop_task_detail.json
    local status analysis status_info
    status="$(json_get /tmp/mini_drop_task_detail.json 'd["data"]["task"]["status"]')"
    analysis="$(json_get /tmp/mini_drop_task_detail.json 'd["data"]["task"].get("analysis_status", 0)')"
    status_info="$(json_get /tmp/mini_drop_task_detail.json 'd["data"]["task"].get("status_info", "")')"
    if [[ "$status" == "4" && "$analysis" == "2" ]]; then
      echo "[matrix] PASS $label tid=$tid"
      return
    fi
    if [[ "$status" == "5" || "$status" == "6" || "$analysis" == "3" ]]; then
      echo "[matrix] FAIL $label tid=$tid status=$status analysis=$analysis info=$status_info" >&2
      return 1
    fi
    if (( SECONDS > deadline )); then
      echo "[matrix] TIMEOUT $label tid=$tid status=$status analysis=$analysis info=$status_info" >&2
      return 1
    fi
    sleep 3
  done
}

wait_continuous_window() {
  local tid="$1"
  local deadline=$((SECONDS + CONTINUOUS_WINDOW + 180))
  while true; do
    curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$tid/windows" >/tmp/mini_drop_windows.json
    if python3 -c 'import json,sys; ws=json.load(open("/tmp/mini_drop_windows.json")).get("data", []); sys.exit(0 if any(w.get("status")==1 for w in ws) else 1)'; then
      echo "[matrix] PASS continuous tid=$tid"
      return
    fi
    if (( SECONDS > deadline )); then
      echo "[matrix] TIMEOUT continuous tid=$tid" >&2
      cat /tmp/mini_drop_windows.json >&2
      return 1
    fi
    sleep 5
  done
}

wait_continuous_analysis() {
  local tid="$1"
  local deadline=$((SECONDS + 360))
  while true; do
    curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$tid/windows" >/tmp/mini_drop_windows.json
    local window_tid
    window_tid="$(python3 - <<'PY'
import json
ws=json.load(open("/tmp/mini_drop_windows.json")).get("data", [])
print(next((w.get("window_tid","") for w in ws if w.get("status")==1), ""))
PY
)"
    if [[ -n "$window_tid" ]]; then
      curl -fsS "${AUTH_HEADERS[@]}" "$API/tasks/$window_tid" >/tmp/mini_drop_window_task.json
      local analysis status_info
      analysis="$(json_get /tmp/mini_drop_window_task.json 'd["data"]["task"].get("analysis_status", 0)')"
      status_info="$(json_get /tmp/mini_drop_window_task.json 'd["data"]["task"].get("status_info", "")')"
      if [[ "$analysis" == "2" ]]; then
        echo "[matrix] PASS continuous analysis tid=$window_tid"
        return
      fi
      if [[ "$analysis" == "3" ]]; then
        echo "[matrix] FAIL continuous analysis tid=$window_tid info=$status_info" >&2
        return 1
      fi
    fi
    if (( SECONDS > deadline )); then
      echo "[matrix] TIMEOUT continuous analysis tid=$tid" >&2
      cat /tmp/mini_drop_windows.json >&2
      return 1
    fi
    sleep 5
  done
}

stop_continuous() {
  local tid="$1"
  if [[ -z "$tid" ]]; then
    return
  fi
  curl -fsS -X POST "$API/tasks/$tid/stop" "${AUTH_HEADERS[@]}" >/tmp/mini_drop_stop_continuous.json 2>/dev/null || true
}

cleanup() {
  stop_continuous "$cp_tid"
}

trap cleanup EXIT

main() {
  wait_http "$API/healthz" "apiserver"
  wait_http "$WEB" "web"
  auth
  AGENT_IP="$(agent_ip)"
  echo "[matrix] using agent $AGENT_IP"

  PY_PID="$(start_python_target)"
  JAVA_PID="$(start_java_target)"
  start_pprof_target
  echo "[matrix] targets: python=$PY_PID java=$JAVA_PID pprof=127.0.0.1:6060"

  failed=0
  run_case() {
    local label="$1"
    shift
    local tid
    tid="$(create_task "$@")"
    if ! wait_task "$tid" "$label"; then
      failed=1
    fi
    echo "[matrix] URL $label: $WEB/task/result?tid=$tid"
  }

  run_case "CPU / perf" matrix-cpu-perf 0 0 "$PY_PID" cpu-cycles
  run_case "Java / async-profiler" matrix-java-async 1 1 "$JAVA_PID" cpu
  run_case "eBPF / bpftrace" matrix-ebpf-sched 6 3 "$PY_PID" sched
  run_case "pprof CPU" matrix-pprof-cpu 10 2 1 cpu
  run_case "pprof Heap" matrix-pprof-heap 11 2 1 heap
	  run_case "Resource Analysis" matrix-resource 5 6 "$PY_PID" resource
	  run_case "Python / memray" matrix-memray 4 4 "$PY_PID" memray
	  run_case "Java Heap" matrix-java-heap 12 5 "$JAVA_PID" heap

	  nl_plan_case "Java async-profiler" "pid $JAVA_PID Java 线程 CPU 高，用 async-profiler 采 10 秒" 1 1
	  nl_plan_case "eBPF sched" "pid $PY_PID 调度抖动，用 eBPF sched 看延迟" 6 3
	  nl_plan_case "Python memray" "pid $PY_PID Python 内存泄漏，用 memray 看分配热点" 4 4

	  local nl_tid
	  nl_tid="$(create_nl_task "pid $PY_PID CPU 飙高，采 $DURATION 秒火焰图，频率 $HZ Hz")"
	  if ! wait_task "$nl_tid" "Natural Language / CPU perf"; then
	    failed=1
	  fi
	  echo "[matrix] URL Natural Language: $WEB/task/result?tid=$nl_tid"

	  cp_tid="$(create_continuous "$PY_PID")"
  if ! wait_continuous_window "$cp_tid"; then
    failed=1
  fi
  stop_continuous "$cp_tid"
  if ! wait_continuous_analysis "$cp_tid"; then
    failed=1
  fi
  echo "[matrix] URL Continuous Timeline: $WEB/continuous?tid=$cp_tid"

  if [[ "$failed" == "0" ]]; then
    echo "[matrix] ALL PASS"
  else
    echo "[matrix] SOME TASKS FAILED; check logs above" >&2
    exit 1
  fi
}

main "$@"
