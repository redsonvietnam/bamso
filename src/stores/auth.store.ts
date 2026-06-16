import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { apiClient } from '@/lib/api-client';

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
            const data = await apiClient.post<{ success: boolean; user?: { id: string; username: string; name: string; role: string }; error?: string }>('/api/auth', { username, password });

            if (data.error || !data.user) {
                set({ isLoading: false });
                return { ok: false, error: data.error || 'Không thể tải thông tin người dùng.' };
            }

            set({ user: data.user, isLoading: false });
            return { ok: true };
        } catch (error) {
            logger.error('Login store error:', error);
            set({ isLoading: false });
            return { ok: false, error: error instanceof Error ? error.message : 'Lỗi hệ thống hoặc kết nối.' };
        }
    },
    logout: async () => {
        try {
            await apiClient.post('/api/auth/logout');
        } catch (error) {
            logger.error('Logout error:', error);
        } finally {
            set({ user: null });
        }
    },
    fetchMe: async () => {
        try {
            const user = await apiClient.get<{ id: string; username: string; name: string; role: string }>('/api/auth/me');
            set({ user });
        } catch (error) {
            logger.error('Fetch me error:', error);
            set({ user: null });
        }
    },
}));
