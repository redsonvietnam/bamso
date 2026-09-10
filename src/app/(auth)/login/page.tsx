"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageWatermark } from '@/components/ui/dong-son-motif';
import { toast } from 'sonner';

export default function LoginPage() {
    const router = useRouter();
    const { login, isLoading, fetchMe } = useAuthStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');
    const [mfaFactor, setMfaFactor] = useState<'totp' | 'recovery'>('totp');
    const [mfaLoading, setMfaLoading] = useState(false);

    // Fetch user info when page mounts — redirect if already authenticated
    useEffect(() => {
        const checkAuth = async () => {
            await fetchMe();
            const currentUser = useAuthStore.getState().user;
            if (currentUser) {
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
                } else if (currentUser.role === 'STAFF') {
                    router.replace('/canbo');
                } else if (currentUser.role === 'KIOSK') {
                    router.replace('/kiosk');
                } else if (currentUser.role === 'DISPLAY') {
                    router.replace('/display');
                }
            }
        };
        checkAuth();
    }, [fetchMe, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            toast.error('Vui lòng điền đầy đủ thông tin đăng nhập.');
            return;
        }

        const result = await login(username.trim(), password);
        if (result.mfaRequired && result.challengeToken) {
            setMfaChallengeToken(result.challengeToken);
            return;
        }
        if (result.ok) {
            toast.success('Đăng nhập thành công!');
            const currentUser = useAuthStore.getState().user;
            if (currentUser) {
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
                } else if (currentUser.role === 'STAFF') {
                    router.replace('/canbo');
                } else if (currentUser.role === 'KIOSK') {
                    router.replace('/kiosk');
                } else if (currentUser.role === 'DISPLAY') {
                    router.replace('/display');
                }
            } else {
                toast.error('Không thể xác định quyền người dùng. Vui lòng thử đăng nhập lại.');
            }
        } else {
            toast.error(result.error || 'Đăng nhập thất bại.');
        }
    };

    const handleMfaVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaCode.trim() || !mfaChallengeToken) return;

        setMfaLoading(true);
        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    challengeToken: mfaChallengeToken,
                    code: mfaCode.trim(),
                    factor: mfaFactor,
                }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success('Xác thực MFA thành công!');
                await fetchMe();
                const currentUser = useAuthStore.getState().user;
                if (currentUser?.role === 'ADMIN') {
                    router.replace('/admin');
                } else {
                    router.replace('/canbo');
                }
            } else {
                toast.error(data.error || 'Mã xác thực không đúng.');
                setMfaCode('');
            }
        } catch {
            toast.error('Lỗi kết nối. Vui lòng thử lại.');
        } finally {
            setMfaLoading(false);
        }
    };

    if (mfaChallengeToken) {
        return (
            <div className="relative min-h-full bg-background font-sans overflow-hidden">
                <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.10]" />
                <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-8">
                    <Card className="w-full max-w-md sketch-radius riso-paper-card glass-card shadow-md">
                        <CardHeader className="space-y-1 text-center">
                            <CardTitle className="text-2xl font-bold tracking-tight">Xác thực hai yếu tố</CardTitle>
                            <CardDescription>
                                Nhập mã xác thực từ ứng dụng authenticator
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleMfaVerify} className="space-y-4">
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant={mfaFactor === 'totp' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setMfaFactor('totp')}
                                    >
                                        TOTP
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={mfaFactor === 'recovery' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setMfaFactor('recovery')}
                                    >
                                        Mã khôi phục
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mfa-code">
                                        {mfaFactor === 'totp' ? 'Mã OTP' : 'Mã khôi phục'}
                                    </Label>
                                    <Input
                                        id="mfa-code"
                                        type="text"
                                        placeholder={mfaFactor === 'totp' ? '000000' : 'XXXX-XXXX'}
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        disabled={mfaLoading}
                                        className="h-10"
                                        autoComplete="one-time-code"
                                    />
                                </div>
                                <Button type="submit" className="w-full font-medium" disabled={mfaLoading || !mfaCode.trim()}>
                                    {mfaLoading ? 'Đang xác thực...' : 'Xác thực'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => {
                                        setMfaChallengeToken(null);
                                        setMfaCode('');
                                    }}
                                >
                                    Quay lại đăng nhập
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-full bg-background font-sans overflow-hidden">
            <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.10]" />
            <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-8">
                <Card className="w-full max-w-md sketch-radius riso-paper-card glass-card shadow-md">
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
                                    placeholder="admin hoặc canbo1"
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
                            <Button type="submit" className="w-full font-medium" disabled={isLoading}>
                                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
