"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

export default function CanboLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, fetchMe } = useAuthStore();

    useEffect(() => {
        fetchMe().then(() => {
            // Check after fetchMe completes (we need to access store state differently or rely on redirect from middleware)
            // Actually middleware handles redirect, but let's also check role client-side
        });
    }, [fetchMe]);

    useEffect(() => {
        if (user && user.role !== 'STAFF' && user.role !== 'ADMIN') {
            router.push('/login');
        }
    }, [user, router]);

    return <>{children}</>;
}
