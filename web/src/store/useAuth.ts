import { create } from 'zustand';
import { authCheck } from '@/api';

interface AuthState {
  uid: string;
  userName: string;
  isAuth: boolean;
  loading: boolean;
  login: (uid?: string, userName?: string) => Promise<void>;
  logout: () => void;
}

const useAuth = create<AuthState>((set) => ({
  uid: '',
  userName: '',
  isAuth: false,
  loading: false,

  login: async (uid?: string, userName?: string) => {
    // 如果传了参数，直接 mock 登录（开发模式）
    if (uid && userName) {
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
    set({ uid: '', userName: '', isAuth: false });
  },
}));

export default useAuth;
