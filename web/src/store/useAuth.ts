import { create } from 'zustand';
import { authCheck, loginApi } from '@/api';

interface AuthState {
  uid: string;
  userName: string;
  isAuth: boolean;
  loading: boolean;
  login: (uid?: string, userName?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const useAuth = create<AuthState>((set) => ({
  uid: '',
  userName: '',
  isAuth: false,
  loading: true, // 初始为 true，等待校验完成

  checkAuth: async () => {
    // 先检查 cookie 是否存在
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

  login: async (uid?: string, userName?: string) => {
    // 调用后端登录端点获取 HMAC token
    if (uid && userName) {
      try {
        const res: any = await loginApi(uid, userName);
        if (res.code === 0) {
          // 后端已通过 Set-Cookie 设置 cookie，前端也存一份 token
          document.cookie = `drop_user_token=${res.data.token}; path=/; max-age=${7 * 86400}`;
          set({ uid, userName, isAuth: true, loading: false });
          return;
        }
      } catch {
        // fallback: 直接设置 cookie（开发模式，无后端）
      }
      document.cookie = `drop_user_uid=${uid}; path=/`;
      document.cookie = `drop_user_name=${encodeURIComponent(userName)}; path=/`;
      set({ uid, userName, isAuth: true, loading: false });
      return;
    }

    // 否则尝试调后端验证
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
