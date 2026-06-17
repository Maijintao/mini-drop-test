import { create } from 'zustand';
import { authCheck, loginApi, registerApi } from '@/api';

interface AuthState {
  uid: string;
  userName: string;
  isAuth: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const useAuth = create<AuthState>((set) => ({
  uid: '',
  userName: '',
  isAuth: false,
  loading: true,

  checkAuth: async () => {
    const uid = document.cookie.match(/(?:^| )drop_user_uid=([^;]+)/)?.[1];
    if (!uid) {
      set({ isAuth: false, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const res: any = await authCheck();
      if (res.code === 0) {
        set({
          uid: res.data.uid,
          userName: res.data.user_name,
          isAuth: true,
          loading: false,
        });
      } else {
        set({ isAuth: false, loading: false });
      }
    } catch {
      set({ isAuth: false, loading: false });
    }
  },

  login: async (username: string, password: string) => {
    const res: any = await loginApi(username, password);
    if (res.code !== 0) {
      throw new Error(res.message || 'login failed');
    }
    document.cookie = `drop_user_token=${res.data.token}; path=/; max-age=${7 * 86400}`;
    set({
      uid: res.data.uid,
      userName: res.data.user_name,
      isAuth: true,
      loading: false,
    });
  },

  register: async (username: string, password: string) => {
    const res: any = await registerApi(username, password);
    if (res.code !== 0) {
      throw new Error(res.message || 'register failed');
    }
    document.cookie = `drop_user_token=${res.data.token}; path=/; max-age=${7 * 86400}`;
    set({
      uid: res.data.uid,
      userName: res.data.user_name,
      isAuth: true,
      loading: false,
    });
  },

  logout: () => {
    document.cookie = 'drop_user_uid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'drop_user_name=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'drop_user_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    set({ uid: '', userName: '', isAuth: false });
  },
}));

// 初始化时自动校验
useAuth.getState().checkAuth();

export default useAuth;
