"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, fetchMe } = useAuthStore();

    useEffect(() => {
        fetchMe().then(() => {
            // fetchMe completes, user state will update and trigger the next useEffect
        });
    }, [fetchMe]);

    useEffect(() => {
        if (user && user.role !== 'ADMIN') {
            router.push('/login');
        }
    }, [user, router]);

    return <>{children}</>;
}
