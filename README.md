# Mini-Drop

一站式性能分析平台：Agent 采集 → Server 调度 → Analyzer 分析 → Web 可视化火焰图/热点/AI 归因

## 架构

```
Web Frontend (React + Ant Design)
    ↓ REST API
APIServer (Go + Gin)
    ↓ gRPC
drop_server (C++) ←→ drop_agent (C++)
    ↓ subprocess
analysis (Python)
```

## 快速启动

```bash
# 前置要求: Docker, Docker Compose, Linux (需要 perf 权限)
docker compose up
```

启动后访问 http://localhost 即可使用。

## 权限要求

drop-agent 容器需要宿主机级权限才能执行 CPU/IO 采集：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `privileged: true` | docker-compose.yml | Agent 需要访问宿主机 `/proc`、`/sys` 及 perf 设备 |
| `pid: host` | docker-compose.yml | 采集宿主机进程信息 |
| `network_mode: host` | docker-compose.yml | Agent 直接与 drop_server 通信 |
| `perf_event_paranoid` | ≤ 1 | 允许非 root 用户采集 CPU 事件 |

**设置 perf_event_paranoid**（宿主机执行）：

```bash
# 临时生效
sudo sysctl kernel.perf_event_paranoid=1

# 永久生效
echo 'kernel.perf_event_paranoid=1' | sudo tee -a /etc/sysctl.d/99-perf.conf
sudo sysctl --system
```

**最小 capabilities 替代方案**（不使用 `--privileged`）：

```yaml
cap_add:
  - CAP_PERFMON    # perf 事件采集
  - CAP_SYS_PTRACE # 进程追踪
  - CAP_BPF        # bpftrace/eBPF
  - CAP_NET_ADMIN   # bpftrace 网络抓包（可选）
```

## 技术栈

| 模块 | 语言 | 框架 |
|------|------|------|
| apiserver | Go | Gin + GORM + gRPC |
| drop (agent/server) | C++17 | gRPC + Protobuf |
| analysis | Python 3.10+ | pytest |
| web | TypeScript | React 19 + Ant Design 6 + d3-flame-graph |

## 目录结构

```
├── apiserver/    # Go 后端编排层
├── drop/         # C++ 采集层 (Agent + Server)
├── analysis/     # Python 分析引擎
├── web/          # React 前端
└── docker-compose.yml
```

## 支持的采集器

- perf (CPU Profiling)
- async-profiler (Java Profiling)
- pprof (Go/C++ pprof)
- bpftrace (eBPF)

## 支持的分析类型

- CPU 火焰图
- TopN 热点函数
- 规则引擎优化建议
- eBPF IO 分析 (biosnoop)
- 资源分析 (pidstat)
- 内存泄漏检测
- 汇编代码分析
