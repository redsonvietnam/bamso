import { create } from 'zustand';

interface User {
    id: string;
    username: string;
    name: string;
    role: string;
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => Promise<void>;
    fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: false,
    login: async (username, password) => {
        set({ isLoading: true });
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                set({ isLoading: false });
                return { ok: false, error: data.error || 'Đăng nhập thất bại.' };
            }

            // After successful login, fetch user info to set in store
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const meData = await meRes.json();
                set({ user: meData, isLoading: false });
                return { ok: true };
            }

            set({ isLoading: false });
            return { ok: false, error: 'Không thể tải thông tin người dùng.' };
        } catch (error) {
            console.error('Login store error:', error);
            set({ isLoading: false });
            return { ok: false, error: 'Lỗi hệ thống hoặc kết nối.' };
        }
    },
    logout: async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            set({ user: null });
        }
    },
    fetchMe: async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const user = await res.json();
                set({ user });
            } else {
                set({ user: null });
            }
        } catch (error) {
            console.error('Fetch me error:', error);
            set({ user: null });
        }
    },
}));
