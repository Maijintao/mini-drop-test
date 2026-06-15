import axios from 'axios';
import type {
  AgentInfo,
  AgentStatData,
  AnalysisSuggestion,
  ApiResponse,
  CosFile,
  CreateTaskParams,
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
  if (uid) cfg.headers['Drop_user_uid'] = uid;
  if (userName) cfg.headers['Drop_user_name'] = userName;
  return cfg;
});

// 响应拦截器：401 跳转登录
api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401 && err.response.data?.code === 4010001) {
      const location = err.response.data.data?.location || '/login';
      window.location.href = location;
    }
    return Promise.reject(err);
  }
);

// ---------- cookie 工具 ----------

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// ---------- API 函数 ----------

// Auth
export const authCheck = (): Promise<ApiResponse<{ uid: string; user_name: string }>> => api.get('/auth/check') as unknown as Promise<ApiResponse<{ uid: string; user_name: string }>>;
export const getUsers = (): Promise<ApiResponse<any>> => api.get('/users') as unknown as Promise<ApiResponse<any>>;

// Agent
export const getAgents = (): Promise<ApiResponse<AgentInfo[]>> => api.get('/agents') as unknown as Promise<ApiResponse<AgentInfo[]>>;
export const statAgent = (ip: string): Promise<ApiResponse<AgentStatData>> =>
  api.get('/agent/stat', { params: { ip } }) as unknown as Promise<ApiResponse<AgentStatData>>;

// Task
export const createTask = (data: CreateTaskParams): Promise<ApiResponse<{ tid: string }>> => api.post('/tasks', data) as unknown as Promise<ApiResponse<{ tid: string }>>;
export const getTasks = (params?: { page?: number; size?: number; status?: string; keyword?: string }) =>
  api.get('/tasks', { params }) as unknown as Promise<ApiResponse<TaskListData>>;
export const getTaskDetail = (tid: string): Promise<ApiResponse<TaskDetailData>> => api.get(`/tasks/${tid}`) as unknown as Promise<ApiResponse<TaskDetailData>>;
export const deleteTask = (tid: string): Promise<ApiResponse<unknown>> => api.delete(`/tasks/${tid}`) as unknown as Promise<ApiResponse<unknown>>;
export const retryTask = (tid: string): Promise<ApiResponse<{ tid: string }>> => api.post(`/tasks/${tid}/retry`) as unknown as Promise<ApiResponse<{ tid: string }>>;
export const getCosFiles = (tid: string): Promise<ApiResponse<CosFile[]>> => api.get('/cosfiles', { params: { tid } }) as unknown as Promise<ApiResponse<CosFile[]>>;

// Suggestion & Analysis
export const getSuggestions = (tid: string): Promise<ApiResponse<AnalysisSuggestion[]>> => api.get(`/tasks/${tid}/suggestions`) as unknown as Promise<ApiResponse<AnalysisSuggestion[]>>;
export const triggerAnalysis = (tid: string): Promise<ApiResponse<unknown>> => api.post(`/tasks/${tid}/analyze`) as unknown as Promise<ApiResponse<unknown>>;

// Flame
export const getFlameData = (tid: string): Promise<ApiResponse<{ type: string; url: string }>> => api.get(`/tasks/${tid}/flame`) as unknown as Promise<ApiResponse<{ type: string; url: string }>>;

export const fetchSignedJson = async <T>(url: string): Promise<T> => {
  const res = await axios.get<T>(url, { withCredentials: false, timeout: 30000 });
  return res.data;
};

// Group
export const createGroup = (data: { name: string }) => api.post('/group', data);
export const getGroups = () => api.get('/groups');
export const deleteGroup = (gid: number) => api.delete(`/group/${gid}`);
export const addMember = (gid: number, uid: string) => api.post(`/group/${gid}/members`, { uid });
export const removeMember = (gid: number, uid: string) => api.delete(`/group/${gid}/members/${uid}`);
export const getGroupMembers = (gid: number) => api.get(`/group/${gid}/members`);

// Schedule
export const createScheduleTask = (data: { tid: string; cron: string }) => api.post('/schedule/task', data);
export const getScheduleTasks = () => api.get('/schedule/tasks');
export const deleteScheduleTask = (tid: string) => api.delete(`/schedule/task/${tid}`);

export default api;
