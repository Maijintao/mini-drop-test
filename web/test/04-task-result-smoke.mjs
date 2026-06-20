#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const result = compact(await readFile('src/pages/TaskResult.tsx'));
const taskPolling = compact(await readFile('src/taskPolling.ts'));

const resultChecks = [
  'getFlameData',
  'getCosFiles',
  'triggerAnalysis',
  '文件下载',
  '火焰图',
  'collapsed.txt',
  'svgMarkup',
  'dangerouslySetInnerHTML',
  'top.json',
  'pprof_cpu.json',
  'pprof_heap.json',
  'pprof 分析',
  'CPU Top Functions',
  'Heap Top Functions',
];

for (const needle of resultChecks) {
  mustContain(result, needle, `TaskResult: ${needle}`);
}

const pollingChecks = [
  'POLL_INTERVAL_MS = 3000',
  'MAX_POLL_COUNT = 120',
  'analysis_status === 0',
  'await triggerAnalysis(tid)',
  'analysis_status === 2 || task.analysis_status === 3',
  'throw new Error(\'任务轮询超时\')',
];

for (const needle of pollingChecks) {
  mustContain(taskPolling, needle, `taskPolling: ${needle}`);
}

report('PASS task-result-smoke', `${resultChecks.length} UI hooks + ${pollingChecks.length} polling hooks`);
