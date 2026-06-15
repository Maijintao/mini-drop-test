import axios from 'axios';

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
export const authCheck = () => api.get('/auth/check');
export const getUsers = () => api.get('/users');

// Agent
export const getAgents = () => api.get('/agents');
export const statAgent = (ip: string) => api.get('/agent/stat', { params: { ip } });

// Task
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

export const createTask = (data: CreateTaskParams) => api.post('/tasks', data);
export const getTasks = (params?: { page?: number; size?: number; status?: string; keyword?: string }) =>
  api.get('/tasks', { params });
export const getTaskDetail = (tid: string) => api.get(`/tasks/${tid}`);
export const deleteTask = (tid: string) => api.delete(`/tasks/${tid}`);
export const retryTask = (tid: string) => api.post(`/tasks/${tid}/retry`);
export const getCosFiles = (tid: string) => api.get('/cosfiles', { params: { tid } });

// Suggestion & Analysis
export const getSuggestions = (tid: string) => api.get(`/tasks/${tid}/suggestions`);
export const triggerAnalysis = (tid: string) => api.post(`/tasks/${tid}/analyze`);

// Flame
export const getFlameData = (tid: string) => api.get(`/tasks/${tid}/flame`);

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
