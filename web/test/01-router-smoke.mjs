#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const source = compact(await readFile('src/router.tsx'));
const routes = [
  "/login",
  "index",
  "tasks",
  "task/result",
  "agents",
  "agents/:ip",
  "groups",
  "schedules",
  "settings",
];

for (const route of routes) {
  mustContain(source, route === '/login' ? `path: '${route}'` : `path: '${route}'`, `route ${route}`);
}

report('PASS route-smoke', `${routes.length} routes mapped`);
