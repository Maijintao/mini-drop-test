# Drop 测试套件

本目录包含 Drop 性能采集系统的测试脚本。

## 测试文件说明

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

## 运行测试

### 前置条件

1. 编译项目：
```bash
cd drop
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

2. 安装依赖（可选，用于完整测试）：
```bash
# Ubuntu/Debian
sudo apt-get install -y libgrpc++-dev libprotobuf-dev protobuf-compiler-grpc nlohmann-json3-dev
```

### 运行所有测试

```bash
cd drop/test
./test_proto.sh
./test_server.sh
./test_server_queue.sh
./test_heartbeat.sh
./test_agent.sh
./test_profiler.sh
./test_storage.sh
./test_config.sh
./test_e2e.sh
```

### 运行单个测试

```bash
# 只运行 Proto 文件测试
./test_proto.sh

# 只运行任务队列测试
./test_server_queue.sh

# 只运行采集器测试
./test_profiler.sh
```

## 测试覆盖范围

### 完整性测试 (test_proto.sh)

- ✅ Proto 文件语法正确（syntax = "proto3"）
- ✅ 5 个 Proto 文件齐全
- ✅ 关键 message 定义完整
- ✅ 关键 service 定义完整
- ✅ Proto 文件可被 protoc 编译

### 单元测试

**Server 端 (test_server.sh, test_server_queue.sh)**：
- ✅ 编译产物检查
- ✅ Server 启动测试
- ✅ 任务队列数据结构
- ✅ PushTask 队列满检查
- ✅ PopTask 空队列检查
- ✅ 结果缓存
- ✅ Agent 状态管理
- ✅ 线程安全（mutex 保护）

**心跳机制 (test_heartbeat.sh)**：
- ✅ Agent 端心跳发送
- ✅ Server 端心跳接收
- ✅ 任务派发流程
- ✅ pending 标志设置

**Agent 端 (test_agent.sh, test_config.sh)**：
- ✅ Config 结构体定义
- ✅ JSON 配置加载
- ✅ 多 Server 故障转移
- ✅ 进程监控模块
- ✅ 超时保护模块
- ✅ 守护进程模块

**采集器 (test_profiler.sh)**：
- ✅ IProfiler 接口定义
- ✅ Perf 采集器实现
- ✅ AsyncProfiler 采集器实现
- ✅ PprofProfiler 采集器实现
- ✅ BpftraceProfiler 采集器实现
- ✅ ProcessKiller 超时保护

**存储 (test_storage.sh)**：
- ✅ StorageClient 接口
- ✅ MinIOClient 实现
- ✅ 无 system() 调用（安全性）
- ✅ fork+execvp 超时保护

### 集成测试 (test_e2e.sh)

- ✅ 正常路径：Server 启动 → Agent 连接 → 心跳互通
- ✅ 异常路径 1：任务失败（PID 不存在）
- ✅ 异常路径 2：Agent 离线检测
- ✅ Docker 构建验证

## 注意事项

1. **权限要求**：部分测试需要 root 权限（如 perf 采集）
2. **端口占用**：测试使用 15051-15053 端口，确保未被占用
3. **Docker 测试**：Docker 构建测试需要在有 Docker 的环境中运行
4. **清理**：测试结束后会自动清理临时文件和进程

## 扩展测试

如需添加更多测试，可参考现有脚本格式：

```bash
test_new_feature() {
    log_info "测试新功能..."

    # 测试逻辑
    if [ condition ]; then
        assert_eq "测试名称" "expected" "actual"
    fi
}
```
