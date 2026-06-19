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
# 前置要求: Docker, Docker Compose, Linux (需要 perf/eBPF 权限)
make demo
```

`make demo` 会构建镜像、启动 PostgreSQL/MinIO/APIServer/drop_server/drop_agent/Web，创建一个 CPU 采集任务，并等待分析产出 `collapsed.txt` 或 `top.json`。启动后访问 http://localhost 即可使用。

只启动服务不跑采集：

```bash
make up
```

轻量检查 Docker Compose 配置：

```bash
make smoke
```

## Docker 交付说明

评审环境只需要 Docker 和 Docker Compose，不需要手工安装 Go、Node、Python、gRPC、MinIO、PostgreSQL 或 perf 分析脚本。依赖被打进各镜像：

| 镜像 | 作用 | 主要内置依赖 |
|------|------|--------------|
| `drop` | `drop_server` + `drop_agent` | C++ gRPC 运行时、`perf`、`bpftrace`、MinIO `mc` |
| `apiserver` | Go API 编排层 | Go 二进制、Python3、分析引擎运行依赖、`perf` |
| `web-frontend` | React UI | Nginx 静态服务 |
| `postgres` / `minio` | 数据库和对象存储 | 官方镜像 |

常用交付命令：

```bash
make build      # 构建所有镜像
make up         # 启动服务
make demo       # Linux 上跑通一次真实 CPU 采集和分析
make down       # 停止服务
make clean      # 清理容器、卷和本地镜像
```

## 平台限制

真实采集器是 Linux-only。`perf`、`bpftrace/eBPF`、`/proc`、`/sys`、`pid: host` 和 perf 事件权限都依赖 Linux 内核能力。

在 macOS 上用 Docker Desktop 可以构建和打开 Web/API，但 `drop-agent` 看到的是 Docker Desktop 的 Linux VM，不是 macOS 宿主机进程；macOS 也没有 Linux perf/eBPF 接口。因此在 macOS 上跑真实采集任务失败是预期现象，建议只做前端/后端页面检查或 mock 演示，真实 CPU/eBPF 演示放到 Ubuntu/Linux 机器。

## 权限要求

drop-agent 容器需要宿主机级权限才能执行 CPU/IO 采集：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `privileged: true` | docker-compose.yml | Agent 需要访问宿主机 `/proc`、`/sys` 及 perf 设备 |
| `pid: host` | docker-compose.yml | 采集宿主机进程信息 |
| `network_mode: host` | docker-compose.yml | Agent 直接与 drop_server 通信 |
| `perf_event_paranoid` | ≤ 1 | 允许非 root 用户采集 CPU 事件 |

Linux 宿主机建议同时确认：

```bash
uname -s
which docker
docker compose version
cat /proc/sys/kernel/perf_event_paranoid
```

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

## 现场演示

CPU 火焰图演示：

```bash
sudo sysctl kernel.perf_event_paranoid=1
make demo
```

成功后终端会输出任务详情链接，例如：

```text
http://localhost/task/result?tid=<tid>
```

页面里重点看：

- “火焰图”：优先用 `collapsed.txt` 层次数据渲染，`top.json` 作为兜底；`flamegraph.svg` 保留在文件列表里下载。
- “热点函数”：展示 TopN。
- “归因分析”：展示证据、结论、可验证假设、追加采集。
- “状态迁移”：同时展示采集状态和分析状态。

eBPF 现场演示需要 Linux + `bpftrace` + 内核 BPF 权限。启动服务后在 Web 中创建 `Biosnoop (eBPF)` 任务，采集器选择 `bpftrace`；或直接调用 API 创建 `type=6, profiler_type=3` 的任务。完成后任务详情会加载 `biosnoop_stats.json` 并展示 I/O 读写、延迟、设备和进程维度统计。

如果 eBPF 任务失败，优先检查：

```bash
docker compose logs --tail=120 drop-agent
docker exec -it drop-agent bpftrace --info
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
- LLM 归因分析（证据编号、工具调用记录、可验证假设）
- eBPF IO 分析 (biosnoop)
- 资源分析 (pidstat)
- 内存泄漏检测
- 汇编代码分析

## LLM 归因评测/演示

LLM 归因不是直接输出普通优化建议。分析引擎先运行本地归因工具读取 TopN、热路径、集中度、规则命中和采集元数据，生成：

- `attribution_evidence.json`：可审计证据，证据编号形如 `[E2.1]`、`[E3.1]`、`[E4]`
- `attribution_tool_calls.json`：工具调用记录
- `attribution_report.md`：强制引用证据编号的归因报告

前端“归因分析”页按证据、结论、可验证假设、追加采集四块展示。可用下面命令给本地演示库补一条 `mock-cmp-002` 记录：

```bash
make seed-attribution-mock
```
