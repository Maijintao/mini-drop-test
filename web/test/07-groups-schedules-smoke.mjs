#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const router = compact(await readFile('src/router.tsx'));
const layout = compact(await readFile('src/layouts/AppLayout.tsx'));
const api = compact(await readFile('src/api/index.ts'));
const domain = compact(await readFile('src/domain.ts'));
const groups = compact(await readFile('src/pages/Groups.tsx'));
const schedules = compact(await readFile('src/pages/Schedules.tsx'));

const checks = [
  [router, "path: 'groups'"],
  [router, "path: 'schedules'"],
  [layout, "用户组"],
  [layout, "定时任务"],
  [domain, 'interface GroupInfo'],
  [domain, 'interface GroupMemberInfo'],
  [domain, 'interface CreateScheduleTaskParams'],
  [api, "createGroup = (data: { name: string })"],
  [api, 'getGroups = ()'],
  [api, 'deleteGroup = (gid: number)'],
  [api, 'addMember = (gid: number, uid: string)'],
  [api, 'removeMember = (gid: number, uid: string)'],
  [api, 'getGroupMembers = (gid: number)'],
  [api, 'createScheduleTask = (data: CreateScheduleTaskParams)'],
  [api, 'getScheduleTasks = ()'],
  [api, 'deleteScheduleTask = (tid: string)'],
  [api, "api.post('/schedule/task', data)"],
  [api, "api.get('/schedule/tasks')"],
  [api, 'api.delete(`/schedule/task/${tid}`)'],
  [groups, 'getGroups()'],
  [groups, 'getGroupMembers(gid)'],
  [groups, 'createGroup({ name: groupName.trim() })'],
  [groups, 'addMember(selectedGroup.gid, memberUid.trim())'],
  [groups, 'removeMember(selectedGroup.gid, uid)'],
  [groups, 'deleteGroup(group.gid)'],
  [schedules, 'getScheduleTasks()'],
  [schedules, 'getAgents()'],
  [schedules, 'createScheduleTask({'],
  [schedules, 'task_name'],
  [schedules, 'target_ip'],
  [schedules, 'cron_expr'],
  [schedules, 'deleteScheduleTask(tid)'],
  [schedules, 'parseTaskParams(task.request_params)'],
];

for (const [source, needle] of checks) {
  mustContain(source, needle, needle);
}

report('PASS groups-schedules-smoke', `${checks.length} wiring checks`);
