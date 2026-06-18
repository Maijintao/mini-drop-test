#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const source = compact(await readFile('src/taskPolling.ts'));

const checks = [
  'async function loadTask',
  'analysisTriggered = true',
  'if (task.status === 5 || task.status === 6)',
  'if (task.status < 4)',
  'onUpdate?.(task, \'collecting\')',
  'onUpdate?.(task, \'analyzing\')',
  'if (task.analysis_status === 2 || task.analysis_status === 3)',
  'await triggerAnalysis(tid)',
  'await wait(POLL_INTERVAL_MS, signal)',
];

for (const needle of checks) {
  mustContain(source, needle, needle);
}

report('PASS task-polling-smoke', `${checks.length} polling checks`);
