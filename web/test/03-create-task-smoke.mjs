#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const home = compact(await readFile('src/pages/Home.tsx'));
const taskList = compact(await readFile('src/pages/TaskList.tsx'));

const checks = [
  ['Home', home, '目标 PID'],
  ['Home', home, '频率 Hz'],
  ['Home', home, '采集类型'],
  ['Home', home, '目标 Agent'],
  ['Home', home, 'createTask(payload)'],
  ['Home', home, 'waitForTaskResult(tid)'],
  ['TaskList', taskList, '目标 PID'],
  ['TaskList', taskList, '频率 Hz'],
  ['TaskList', taskList, '采集类型'],
  ['TaskList', taskList, '目标 Agent'],
  ['TaskList', taskList, 'createTask({'],
  ['TaskList', taskList, 'waitForTaskResult(tid)'],
];

for (const [name, source, needle] of checks) {
  mustContain(source, needle, `${name}: ${needle}`);
}

report('PASS create-task-smoke', 'Home + TaskList forms wired');
