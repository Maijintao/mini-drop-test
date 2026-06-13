#!/bin/bash

# 测试任务创建
# 用法: ./test_create_task.sh <target_ip> <pid> <duration>

TARGET_IP=${1:-"127.0.0.1"}
PID=${2:-$$}  # 默认使用当前进程 PID
DURATION=${3:-10}

echo "Creating task for target=$TARGET_IP, pid=$PID, duration=$DURATION"

grpcurl -plaintext -d '{
  "target_ip": "'$TARGET_IP'",
  "service": "hotmethod",
  "task_desc": {
    "task_id": "test-001",
    "task_type": 0,
    "profiler_type": 0,
    "sample_argv": {
      "hz": 99,
      "duration": '$DURATION',
      "pid": '$PID',
      "callgraph": "fp",
      "subprocess": false,
      "event": "cpu-cycles"
    },
    "timeout_sec": 30
  }
}' localhost:50051 drop.Control/CreateTask
