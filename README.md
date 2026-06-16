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
