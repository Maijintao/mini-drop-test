import { create } from 'zustand';
import { authCheck } from '@/api';

interface AuthState {
  uid: string;
  userName: string;
  isAuth: boolean;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const useAuth = create<AuthState>((set) => ({
  uid: '',
  userName: '',
  isAuth: false,
  loading: true,

  login: async () => {
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
    window.location.href = '/login';
  },
}));

export default useAuth;
