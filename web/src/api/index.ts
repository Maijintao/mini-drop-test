import axios from 'axios';
import type {
  AgentInfo,
  AgentStateHistory,
  AgentStatData,
  AnalysisSuggestion,
  ApiResponse,
  CosFile,
  CreateContinuousParams,
  CreateScheduleTaskParams,
  CreateTaskParams,
  ContinuousWindow,
  FlameDiffResult,
  GroupInfo,
  GroupMemberInfo,
  HotmethodTask,
  LLMSettings,
  TaskStateHistory,
  TaskDetailData,
  TaskListData,
} from '@/domain';

// ---------- axios 实例 ----------

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 30000,
});

// 请求拦截器：从 cookie 读取用户信息，设到 header
api.interceptors.request.use((cfg) => {
  const uid = getCookie('drop_user_uid');
  const userName = getCookie('drop_user_name');
  const token = getCookie('drop_user_token');
  if (uid) cfg.headers['Drop_user_uid'] = uid;
  if (userName) cfg.headers['Drop_user_name'] = userName;
  if (token) cfg.headers['Drop_user_token'] = token;
  return cfg;
});

// 响应拦截器：401 跳转登录（双重判断：HTTP 401 + 业务码 4010001）
api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401 && err.response.data?.code === 4010001) {
      const raw = err.response.data.data?.location || '/login';
      try {
        const loc = new URL(raw, window.location.origin);
        loc.searchParams.set('redirect_uri', window.location.href);
        window.location.href = loc.toString();
      } catch {
        window.location.href = raw;
      }
    }
    return Promise.reject(err);
  }
);

// ---------- cookie 工具 ----------

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// ---------- 类型安全的请求封装 ----------

function typedGet<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
  return api.get(url, { params }) as unknown as Promise<ApiResponse<T>>;
}

function typedPost<T>(url: string, data?: any): Promise<ApiResponse<T>> {
  return api.post(url, data) as unknown as Promise<ApiResponse<T>>;
}

function typedDelete<T>(url: string): Promise<ApiResponse<T>> {
  return api.delete(url) as unknown as Promise<ApiResponse<T>>;
}

// ---------- API 函数 ----------

// Auth
export const authCheck = () => typedGet<{ uid: string; user_name: string }>('/auth/check');
export const loginApi = (username: string, password: string) =>
  typedPost<{ uid: string; user_name: string; token: string }>('/auth/login', { username, password });
export const registerApi = (username: string, password: string) =>
  typedPost<{ uid: string; user_name: string; token: string }>('/auth/register', { username, password });
export const getUsers = () => typedGet<any>('/users');
export const getLLMSettings = () => typedGet<LLMSettings>('/settings/llm');
export const updateLLMSettings = (data: Pick<LLMSettings, 'base_url' | 'model'> & { token?: string; clear_token?: boolean }) =>
  api.put('/settings/llm', data) as unknown as Promise<ApiResponse<LLMSettings>>;

// Agent
export const getAgents = () => typedGet<AgentInfo[]>('/agents');
export const statAgent = (ip: string) => typedGet<AgentStatData>('/agent/stat', { ip });
export const getAgentAuditLog = (params?: { ip?: string; limit?: number }) =>
  typedGet<AgentStateHistory[]>('/agent/audit-log', params);

// Task
export const createTask = (data: CreateTaskParams) => typedPost<{ tid: string }>('/tasks', data);
export const getTasks = (params?: { page?: number; size?: number; status?: string; keyword?: string }) =>
  typedGet<TaskListData>('/tasks', params);
export const getTaskDetail = (tid: string) => typedGet<TaskDetailData>(`/tasks/${tid}`);
export const getTaskStateHistory = (tid: string) => typedGet<TaskStateHistory[]>(`/tasks/${tid}/state_history`);
export const deleteTask = (tid: string) => typedDelete<unknown>(`/tasks/${tid}`);
export const retryTask = (tid: string) => typedPost<{ tid: string }>(`/tasks/${tid}/retry`);
export const getCosFiles = (tid: string) => typedGet<CosFile[]>('/cosfiles', { tid });

// Continuous Profiling
export const createContinuousTask = (data: CreateContinuousParams) =>
  typedPost<{ tid: string }>('/tasks/continuous', data);
export const getContinuousWindows = (tid: string, params?: { from?: string; to?: string }) =>
  typedGet<ContinuousWindow[]>(`/tasks/${tid}/windows`, params as Record<string, any>);
export const stopContinuousTask = (tid: string) =>
  typedPost<unknown>(`/tasks/${tid}/stop`);

// Suggestion & Analysis
export const getSuggestions = (tid: string) => typedGet<AnalysisSuggestion[]>(`/tasks/${tid}/suggestions`);
export const triggerAnalysis = (tid: string) => typedPost<unknown>(`/tasks/${tid}/analyze`);

// Flame
export const getFlameData = (tid: string) => typedGet<{ type: string; url: string }>(`/tasks/${tid}/flame`);
export const flameDiff = (tid1: string, tid2: string) =>
  typedPost<FlameDiffResult>('/flame/diff', { tid1, tid2 });

export const fetchSignedJson = async <T>(url: string): Promise<T> => {
  const res = await axios.get<T>(url, { withCredentials: false, timeout: 30000 });
  return res.data;
};

// Group
export const createGroup = (data: { name: string }) => typedPost<GroupInfo>('/group', data);
export const getGroups = () => typedGet<GroupInfo[]>('/groups');
export const deleteGroup = (gid: number) => typedDelete<unknown>(`/group/${gid}`);
export const addMember = (gid: number, uid: string) => typedPost<unknown>(`/group/${gid}/members`, { uid });
export const removeMember = (gid: number, uid: string) => typedDelete<unknown>(`/group/${gid}/members/${uid}`);
export const getGroupMembers = (gid: number) => typedGet<GroupMemberInfo[]>(`/group/${gid}/members`);

// Schedule
export const createScheduleTask = (data: CreateScheduleTaskParams) =>
  typedPost<{ tid: string; cron_expr: string; message: string }>('/schedule/task', data);
export const getScheduleTasks = () => typedGet<HotmethodTask[]>('/schedule/tasks');
export const deleteScheduleTask = (tid: string) => typedDelete<unknown>(`/schedule/task/${tid}`);

export default api;
