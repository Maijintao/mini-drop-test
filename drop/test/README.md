# Drop 测试套件

本目录包含 Drop 性能采集系统的测试脚本。

## 测试文件说明

| 文件 | 类型 | 说明 |
|---|---|---|
| `test_server.sh` | 单元测试 | Server 端：任务队列、心跳派发、结果缓存、Agent 状态查询 |
| `test_agent.sh` | 单元测试 | Agent 端：配置加载、进程监控、采集器接口、超时保护 |
| `test_e2e.sh` | 集成测试 | 端到端：正常路径、任务失败、Agent 离线、Docker 构建 |

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
chmod +x *.sh
./test_server.sh
./test_agent.sh
./test_e2e.sh
```

### 运行单个测试

```bash
# 只运行 Server 端测试
./test_server.sh

# 只运行 Agent 端测试
./test_agent.sh

# 只运行端到端测试
./test_e2e.sh
```

## 测试覆盖范围

### 单元测试 (test_server.sh, test_agent.sh)

- ✅ 编译产物检查
- ✅ Server 启动测试
- ✅ 配置文件格式验证
- ✅ 日志模块检查
- ✅ Proto 文件完整性
- ✅ 采集器接口定义
- ✅ 进程监控模块
- ✅ 超时保护模块
- ✅ 存储客户端接口
- ✅ 守护进程模块
- ✅ 容器信息检测

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
