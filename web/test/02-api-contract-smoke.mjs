#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const source = compact(await readFile('src/api/index.ts'));

const expectations = [
  `baseURL: '/api/v1'`,
  `withCredentials: true`,
  `timeout: 30000`,
  `Drop_user_uid`,
  `Drop_user_name`,
  `createTask = (data: CreateTaskParams)`,
  `typedPost<{ tid: string }>('/tasks', data)`,
  `createNaturalLanguageTask = (data: { text: string; target_ip?: string; pid?: number; execute?: boolean })`,
  `typedPost<NaturalLanguageTaskResult>('/tasks/nl', data)`,
  `typedGet<TaskListData>('/tasks', params)`,
  'typedGet<TaskDetailData>(`/tasks/${tid}`)',
  'typedDelete<unknown>(`/tasks/${tid}`)',
  'typedPost<{ tid: string }>(`/tasks/${tid}/retry`)',
  `typedGet<CosFile[]>('/cosfiles', { tid })`,
  'typedGet<AnalysisSuggestion[]>(`/tasks/${tid}/suggestions`)',
  'typedPost<unknown>(`/tasks/${tid}/analyze`)',
  'typedGet<{ type: string; key?: string; url: string }>(`/tasks/${tid}/flame`)',
  "typedPost<GroupInfo>('/group'",
  "typedGet<GroupInfo[]>('/groups')",
  "typedDelete<unknown>(`/group/${gid}`)",
  "typedPost<unknown>(`/group/${gid}/members`",
  "typedDelete<unknown>(`/group/${gid}/members/${uid}`)",
  "typedGet<GroupMemberInfo[]>(`/group/${gid}/members`)",
  "typedPost<{ tid: string; cron_expr: string; message: string }>('/schedule/task'",
  "typedGet<HotmethodTask[]>('/schedule/tasks')",
  "typedDelete<unknown>(`/schedule/task/${tid}`)",
];

for (const needle of expectations) {
  mustContain(source, needle, needle);
}

report('PASS api-contract-smoke', `${expectations.length} API mappings`);
