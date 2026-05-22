"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
    const router = useRouter();
    const { login, user, isLoading, fetchMe } = useAuthStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Fetch user info when page mounts
    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    // Redirect based on user role when user updates
    useEffect(() => {
        if (user) {
            if (user.role === 'ADMIN') {
                router.push('/admin');
            } else if (user.role === 'STAFF') {
                router.push('/canbo');
            } else if (user.role === 'KIOSK') {
                router.push('/kiosk');
            } else if (user.role === 'DISPLAY') {
                router.push('/display');
            }
        }
    }, [user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            toast.error('Vui lòng điền đầy đủ thông tin đăng nhập.');
            return;
        }

        const result = await login(username.trim(), password);
        if (result.ok) {
            toast.success('Đăng nhập thành công!');
        } else {
            toast.error(result.error || 'Đăng nhập thất bại.');
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-12 font-sans">
            <Card className="w-full max-w-md shadow-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight">Đăng nhập hệ thống</CardTitle>
                    <CardDescription>
                        Nhập tài khoản của bạn để truy cập hệ thống quản lý hàng đợi
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Tên đăng nhập</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="admin hoặc staff1"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Mật khẩu</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                                className="h-10"
                            />
                        </div>
                        <Button type="submit" className="w-full h-10 font-medium" disabled={isLoading}>
                            {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
