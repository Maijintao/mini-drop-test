#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const home = compact(await readFile('src/pages/Home.tsx'));
const taskList = compact(await readFile('src/pages/TaskList.tsx'));
const modal = compact(await readFile('src/components/CreateTaskModal.tsx'));

const checks = [
  ['CreateTaskModal', modal, '目标 PID'],
  ['CreateTaskModal', modal, '采样频率'],
  ['CreateTaskModal', modal, '采集类型'],
  ['CreateTaskModal', modal, '目标 Agent'],
  ['CreateTaskModal', modal, '任务名称'],
  ['CreateTaskModal', modal, 'Callgraph'],
  ['Home', home, '<CreateTaskModal'],
  ['Home', home, 'createTask(payload)'],
  ['Home', home, 'createTaskPoller(tid)'],
  ['TaskList', taskList, '<CreateTaskModal'],
  ['TaskList', taskList, 'createTask({'],
  ['TaskList', taskList, 'createTaskPoller(tid)'],
];

for (const [name, source, needle] of checks) {
  mustContain(source, needle, `${name}: ${needle}`);
}

report('PASS create-task-smoke', 'Home + TaskList forms wired');
