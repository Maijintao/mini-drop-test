#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const tests = [
  '01-router-smoke.mjs',
  '02-api-contract-smoke.mjs',
  '03-create-task-smoke.mjs',
  '04-task-result-smoke.mjs',
  '05-login-settings-agents-smoke.mjs',
  '06-task-polling-smoke.mjs',
];

let failed = false;

for (const test of tests) {
  const child = spawnSync('node', [path.join(here, test)], { stdio: 'inherit' });
  if (child.status !== 0) {
    failed = true;
    break;
  }
}

process.exitCode = failed ? 1 : 0;
