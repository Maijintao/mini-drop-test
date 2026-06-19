#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-postgres}"
DB_NAME="${DB_NAME:-drop}"
DB_USER="${DB_USER:-postgres}"
TID="${TID:-mock-cmp-002}"

docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<SQL
INSERT INTO hotmethod_task (
  tid, name, type, profiler_type, target_ip, request_params,
  status, analysis_status, status_info, uid, user_name, create_time, created_at, updated_at
) VALUES (
  '${TID}', 'mock CPU 归因演示', 0, 0, '127.0.0.1',
  '{"pid":12345,"duration":30,"hz":99,"callgraph":"dwarf"}',
  4, 2, 'mock attribution demo', 'demo', 'demo', NOW(), NOW(), NOW()
)
ON CONFLICT (tid) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  profiler_type = EXCLUDED.profiler_type,
  target_ip = EXCLUDED.target_ip,
  request_params = EXCLUDED.request_params,
  status = 4,
  analysis_status = 2,
  status_info = EXCLUDED.status_info,
  updated_at = NOW();

DELETE FROM analysis_suggestion
WHERE tid = '${TID}' AND func = '整体归因报告';

INSERT INTO analysis_suggestion (
  tid, func, suggestion, ai_suggestion, status, created_at, updated_at
) VALUES (
  '${TID}',
  '整体归因报告',
  '基于可审计证据 JSON、工具调用记录、TopN、热路径、集中度和规则命中生成的归因报告。',
  '# 智能归因报告 - ${TID}

- 生成时间: mock
- 模型: mock
- 总采样: 1000 | 函数数: 6 | Gini: 0.612
- Top1: 41.2% | Top3: 72.8% | Top5: 89.5%
- 目标: 127.0.0.1 PID=12345 采样30s@99Hz

## 证据
- [E2.1] Top1 热点函数 service::matchRules self=412，占比 41.2%。
- [E3.1] 最热调用路径 main -> handleRequest -> matchRules 占比 38.6%，说明热点集中在请求主路径。
- [E4] 总采样 1000，Top3 占比 72.8%，Gini=0.612，CPU 分布明显集中。
- [E5.1] 规则命中 service::matchRules：热点函数可能存在重复计算或锁竞争，需要结合源码确认。

## 结论
- 当前 CPU 瓶颈优先归因到请求主路径中的 service::matchRules，而不是均匀分散的系统噪声；依据 [E2.1]、[E3.1] 和 [E4]。

## 可验证假设
- 若 service::matchRules 内存在重复规则扫描，源码行级采样应继续落在同一函数内部循环或比较逻辑上 [E2.1]。
- 若该热点来自锁竞争，追加 off-CPU 或互斥锁采集后应看到 handleRequest -> matchRules 附近等待时间升高 [E3.1]。

## 追加采集
- 追加 60s CPU 采样并启用 dwarf/源码行号，用于确认热点是否稳定集中在 service::matchRules [E2.1]。
- 追加 off-CPU 或锁等待采集，用于区分纯计算、锁竞争和外部等待三种根因 [E3.1]。',
  2, NOW(), NOW()
);
SQL

echo "seeded attribution mock for ${TID}"
