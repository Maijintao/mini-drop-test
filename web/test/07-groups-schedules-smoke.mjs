#!/usr/bin/env node

import { compact, mustContain, readFile, report } from './_utils.mjs';

const router = compact(await readFile('src/router.tsx'));
const layout = compact(await readFile('src/layouts/AppLayout.tsx'));
const api = compact(await readFile('src/api/index.ts'));
const domain = compact(await readFile('src/domain.ts'));
const groups = compact(await readFile('src/pages/Groups.tsx'));
const taskList = compact(await readFile('src/pages/TaskList.tsx'));
const schedulePanel = compact(await readFile('src/components/ScheduleTasksPanel.tsx'));
const agents = compact(await readFile('src/pages/Agents.tsx'));
const agentDetail = compact(await readFile('src/pages/AgentDetail.tsx'));

const checks = [
  [router, "path: 'groups'"],
  [router, "path: 'schedules'"],
  [router, "path: 'agents/:ip'"],
  [layout, "用户组"],
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
  [api, "typedPost<{ tid: string; cron_expr: string; message: string }>('/schedule/task', data)"],
  [api, "typedGet<HotmethodTask[]>('/schedule/tasks')"],
  [api, 'typedDelete<unknown>(`/schedule/task/${tid}`)'],
  [groups, 'getGroups()'],
  [groups, 'getGroupMembers(gid)'],
  [groups, 'createGroup({ name: groupName.trim() })'],
  [groups, 'addMember(selectedGroup.gid, memberUid.trim())'],
  [groups, 'removeMember(selectedGroup.gid, uid)'],
  [groups, 'deleteGroup(group.gid)'],
  [router, '<Navigate to="/tasks?view=schedules" replace />'],
  [taskList, '<ScheduleTasksPanel agents={agents} />'],
  [taskList, "viewParam === 'schedules'"],
  [schedulePanel, 'getScheduleTasks()'],
  [schedulePanel, 'createScheduleTask({'],
  [schedulePanel, 'task_name'],
  [schedulePanel, 'target_ip'],
  [schedulePanel, 'cron_expr'],
  [schedulePanel, 'deleteScheduleTask(tid)'],
  [schedulePanel, 'parseTaskParams(task.request_params)'],
  [agents, "navigate(`/agents/${encodeURIComponent(agent.ip_addr)}`)"],
  [agentDetail, 'statAgent(ip)'],
  [agentDetail, 'getTasks({ page: 1, size: 100, keyword: ip })'],
];

for (const [source, needle] of checks) {
  mustContain(source, needle, needle);
}

report('PASS groups-schedules-smoke', `${checks.length} wiring checks`);
