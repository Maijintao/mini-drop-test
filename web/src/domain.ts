export interface ApiResponse<T> {
  code: number;
  data?: T;
  message?: string;
}

export interface AgentInfo {
  id: number;
  hostname: string;
  ip_addr: string;
  online: boolean;
  uid: string;
  gid: number;
  version: string;
  environment: string;
  last_heartbeat: string;
  created_at: string;
  updated_at: string;
}

export interface TaskParams {
  pid?: number;
  duration?: number;
  hz?: number;
  callgraph?: string;
  subprocess?: boolean;
  event?: string;
  cron_expr?: string;
}

export interface CreateTaskParams {
  name: string;
  type?: number;
  profiler_type?: number;
  target_ip: string;
  pid: number;
  duration: number;
  hz?: number;
  callgraph?: string;
  subprocess?: boolean;
  event?: string;
}

export interface HotmethodTask {
  id: number;
  tid: string;
  name: string;
  type: number;
  profiler_type: number;
  target_ip: string;
  request_params?: TaskParams | string | null;
  status: number;
  analysis_status: number;
  status_info: string;
  uid: string;
  user_name: string;
  create_time: string;
  begin_time?: string | null;
  end_time?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskListData {
  total: number;
  list: HotmethodTask[];
  page: number;
  size: number;
}

export interface CosFile {
  key?: string;
  name?: string;
  url: string;
  size?: number;
}

export interface AnalysisSuggestion {
  id: number;
  tid: string;
  func: string;
  suggestion: string;
  ai_suggestion: string;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface GroupInfo {
  gid: number;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberInfo {
  gid: number;
  uid: string;
}

export interface CreateScheduleTaskParams {
  task_name: string;
  type?: number;
  profiler_type?: number;
  target_ip: string;
  pid: number;
  duration: number;
  hz?: number;
  callgraph?: string;
  cron_expr: string;
}

export interface TaskDetailData {
  task: HotmethodTask;
  suggestions?: AnalysisSuggestion[];
  cos_files?: CosFile[];
}

export interface TopFunction {
  func: string;
  self: number;
  total: number;
}

export interface PidStats {
  pid?: number;
  cpu_percent?: number;
  rss_kb?: number;
  read_kb_per_sec?: number;
  write_kb_per_sec?: number;
}

export interface AgentStatData {
  code?: number;
  message?: string;
  self_pstats?: PidStats;
  children_pstats?: PidStats;
}

export const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '新建', color: 'rgba(255,255,255,0.45)' },
  1: { label: '执行中', color: '#60a5fa' },
  2: { label: '成功', color: '#4ade80' },
  3: { label: '失败', color: '#f87171' },
};

export const analysisMap: Record<number, { label: string; color: string }> = {
  0: { label: '待分析', color: 'rgba(255,255,255,0.45)' },
  1: { label: '分析中', color: '#60a5fa' },
  2: { label: '已完成', color: '#4ade80' },
  3: { label: '失败', color: '#f87171' },
};

export const profilerTypeMap: Record<number, string> = {
  0: 'perf',
  1: 'async-profiler',
  2: 'pprof',
  3: 'bpftrace',
};

export const taskTypeMap: Record<number, string> = {
  0: 'CPU Profiling',
  1: 'Java Profiling',
  2: 'Tracing',
  4: 'MemCheck',
  5: 'Resource Analysis',
  6: 'Biosnoop (eBPF)',
  7: 'BW Sync',
  8: 'Namespace',
  9: 'Assembly',
  10: 'pprof CPU',
  11: 'pprof Heap',
};

export function parseTaskParams(params: HotmethodTask['request_params']): TaskParams {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params) as TaskParams;
    } catch {
      return {};
    }
  }
  return params;
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '-';
  return time.toLocaleString();
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return '-';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '-';
  const deltaSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (deltaSec < 60) return `${deltaSec} 秒前`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`;
  return `${Math.floor(deltaSec / 86400)} 天前`;
}

export function formatDuration(task: HotmethodTask): string {
  const params = parseTaskParams(task.request_params);
  if (params.duration) return `${params.duration}s`;
  if (task.begin_time && task.end_time) {
    const begin = new Date(task.begin_time).getTime();
    const end = new Date(task.end_time).getTime();
    if (!Number.isNaN(begin) && !Number.isNaN(end) && end >= begin) {
      return `${Math.round((end - begin) / 1000)}s`;
    }
  }
  return '-';
}

export function basename(path?: string): string {
  if (!path) return '-';
  return path.split('/').filter(Boolean).pop() || path;
}
