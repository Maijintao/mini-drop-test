#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const source = compact(await readFile('src/api/index.ts'));

const expectations = [
  `baseURL: '/api/v1'`,
  `withCredentials: true`,
  `timeout: 30000`,
  `Drop_user_uid`,
  `Drop_user_name`,
  `api.post('/tasks', data)`,
  `api.get('/tasks', { params })`,
  'api.get(`/tasks/${tid}`)',
  'api.delete(`/tasks/${tid}`)',
  'api.post(`/tasks/${tid}/retry`)',
  `api.get('/cosfiles', { params: { tid } })`,
  'api.get(`/tasks/${tid}/suggestions`)',
  'api.post(`/tasks/${tid}/analyze`)',
  'api.get(`/tasks/${tid}/flame`)',
  "api.post('/group'",
  "api.get('/groups')",
  "api.delete(`/group/${gid}`)",
  "api.post(`/group/${gid}/members`",
  "api.delete(`/group/${gid}/members/${uid}`)",
  "api.get(`/group/${gid}/members`)",
  "api.post('/schedule/task'",
  "api.get('/schedule/tasks')",
  "api.delete(`/schedule/task/${tid}`)",
];

for (const needle of expectations) {
  mustContain(source, needle, needle);
}

report('PASS api-contract-smoke', `${expectations.length} API mappings`);
