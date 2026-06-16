#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const source = compact(await readFile('src/taskPolling.ts'));

const checks = [
  'async function loadTask',
  'analysisTriggered = true',
  'if (task.status === 3)',
  'if (task.status < 2)',
  'options.onUpdate?.(task, \'collecting\')',
  'options.onUpdate?.(task, \'analyzing\')',
  'if (task.analysis_status === 2 || task.analysis_status === 3)',
  'await triggerAnalysis(tid)',
  'await wait(POLL_INTERVAL_MS)',
];

for (const needle of checks) {
  mustContain(source, needle, needle);
}

report('PASS task-polling-smoke', `${checks.length} polling checks`);
