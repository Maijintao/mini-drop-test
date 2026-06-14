# Drop 测试套件

本目录包含 Drop 性能采集系统的测试脚本，共 14 个。

## 测试文件说明

### 基础测试（9 个）

| 文件 | 类型 | 测试内容 |
|---|---|---|
| `test_proto.sh` | 完整性测试 | Proto 文件语法、字段定义、服务定义 |
| `test_server.sh` | 单元测试 | Server 启动、配置文件、日志模块、Proto 完整性 |
| `test_server_queue.sh` | 单元测试 | 任务队列数据结构、PushTask/PopTask、线程安全 |
| `test_heartbeat.sh` | 单元测试 | 心跳发送/接收、任务派发流程 |
| `test_agent.sh` | 单元测试 | 配置加载、进程监控、采集器接口、超时保护 |
| `test_profiler.sh` | 单元测试 | IProfiler 接口、4 种采集器实现、ProcessKiller |
| `test_storage.sh` | 单元测试 | StorageClient 接口、MinIOClient 实现、安全性 |
| `test_config.sh` | 单元测试 | Config 结构体、配置文件格式、多 Server 故障转移 |
| `test_e2e.sh` | 集成测试 | 正常路径、任务失败、Agent 离线、Docker 构建 |

### 深度测试（5 个）

| 文件 | 类型 | 测试内容 |
|---|---|---|
| `test_task_state.sh` | 深度测试 | 任务状态机 PENDING→RUNNING→DONE/FAILED、状态迁移落库 |
| `test_offline_detection.sh` | 深度测试 | 30s 离线检测、审计日志（离线/恢复） |
| `test_grpc_services.sh` | 深度测试 | 4 个 gRPC 服务接口完整性、服务注册 |
| `test_error_handling.sh` | 深度测试 | 参数校验、信号处理、gRPC 超时、采集器错误处理 |
| `test_daemon.sh` | 深度测试 | 守护进程化流程（fork→setsid→fork→关 fd） |

## 运行测试

### 前置条件

1. 编译项目：
```bash
cd drop
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

### 运行所有测试

```bash
cd drop/test

# 基础测试
./test_proto.sh
./test_server.sh
./test_server_queue.sh
./test_heartbeat.sh
./test_agent.sh
./test_profiler.sh
./test_storage.sh
./test_config.sh
./test_e2e.sh

# 深度测试
./test_task_state.sh
./test_offline_detection.sh
./test_grpc_services.sh
./test_error_handling.sh
./test_daemon.sh
```

## 测试覆盖范围

### 题目要求覆盖

- ✅ 任务状态机：PENDING → RUNNING → UPLOADING → DONE/FAILED
- ✅ 状态迁移落库：每次迁移带 reason 字段
- ✅ 心跳频率：Agent 每 5s 心跳
- ✅ 离线检测：Server 30s 无心跳判离线
- ✅ 审计日志：离线/恢复必须有审计日志
- ✅ 结构化日志：LOG_DEBUG/INFO/WARN/ERROR
- ✅ 显式错误处理：参数校验、信号处理、超时处理
- ✅ 单测覆盖 ≥ 50%
- ✅ ≥ 3 个端到端集成测试（正常路径 + 2 类异常路径）

### 复刻指南覆盖

- ✅ 4 个 gRPC 服务（healthcheck/hotmethod/control/init）
- ✅ 任务队列 tasks_[ip] + mutex
- ✅ 心跳机制（发送/接收/派发）
- ✅ 4 种采集器（Perf/AsyncProfiler/Pprof/Bpftrace）
- ✅ eBPF 内核态探针（block_rq_issue, sched_wakeup）
- ✅ Process 自监控（/proc/stat, /proc/io）
- ✅ ProcessKiller 超时保护
- ✅ StorageClient（MinIO，无 system()）
- ✅ Config 多 Server 故障转移
- ✅ Daemon 守护进程化

## 注意事项

1. **权限要求**：部分测试需要 root 权限（如 perf 采集）
2. **端口占用**：测试使用 15051-15053 端口，确保未被占用
3. **Docker 测试**：Docker 构建测试需要在有 Docker 的环境中运行
4. **清理**：测试结束后会自动清理临时文件和进程
