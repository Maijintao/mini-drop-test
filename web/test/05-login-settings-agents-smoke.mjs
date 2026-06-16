#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const login = compact(await readFile('src/pages/Login.tsx'));
const auth = compact(await readFile('src/store/useAuth.ts'));
const settings = compact(await readFile('src/pages/Settings.tsx'));
const agents = compact(await readFile('src/pages/Agents.tsx'));

const checks = [
  [login, 'navigate(\'/index\''],
  [auth, 'drop_user_uid'],
  [auth, 'drop_user_name'],
  [auth, 'authCheck()'],
  [settings, 'api.get(\'/healthz\')'],
  [settings, 'getUsers()'],
  [settings, 'API Base URL'],
  [agents, 'getAgents()'],
  [agents, 'statAgent(agent.ip_addr)'],
  [agents, '在线 Agent'],
];

for (const [source, needle] of checks) {
  mustContain(source, needle, needle);
}

report('PASS login-settings-agents-smoke', `${checks.length} wiring checks`);
