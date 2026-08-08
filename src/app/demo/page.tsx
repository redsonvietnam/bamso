"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, UserPlus, LayoutGrid, Smartphone, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export default function DemoPage() {
    const [isSettingUp, setIsSettingUp] = useState(true);
    const [demoTokens, setDemoTokens] = useState<Record<string, string>>({});

    useEffect(() => {
        const setupDemo = async () => {
            const tokens: Record<string, string> = {};
            for (const role of ['STAFF', 'DISPLAY']) {
                try {
                    const data = await apiClient.get<{token:string}>(`/api/demo-token?role=${role}`);
                    tokens[role] = data.token;
                } catch (error) {
                    logger.error(`Error getting demo token for ${role}:`, error);
                }
            }
            setDemoTokens(tokens);
            setIsSettingUp(false);
        };

        setupDemo();
    }, []);

    const views = [
        {
            title: 'Khách hàng — Lấy số',
            description: 'Trang chủ mobile, chọn dịch vụ và lấy số',
            icon: <Smartphone className="w-5 h-5" />,
            href: '/',
            color: 'bg-blue-50 border-blue-200',
        },
        {
            title: 'Tra cứu vé',
            description: 'Khách hàng tra cứu trạng thái vé theo thời gian thực',
            icon: <RefreshCw className="w-5 h-5" />,
            href: '/track',
            color: 'bg-green-50 border-green-200',
        },
        {
            title: 'Bảng hiển thị TV',
            description: 'Màn hình hiển thị số đang gọi và hàng đợi',
            icon: <Monitor className="w-5 h-5" />,
            href: '/display',
            color: 'bg-purple-50 border-purple-200',
        },
        {
            title: 'Kiosk — Máy lấy số',
            description: 'Giao diện máy tính bảng cho khách tự lấy số',
            icon: <LayoutGrid className="w-5 h-5" />,
            href: '/kiosk',
            color: 'bg-orange-50 border-orange-200',
        },
    ];

    const protectedViews = [
        {
            title: 'Cán bộ trực quầy',
            description: 'Gọi số, hoàn thành, bỏ qua, khôi phục vé',
            icon: <UserPlus className="w-5 h-5" />,
            href: '/canbo',
            color: 'bg-indigo-50 border-indigo-200',
            role: 'STAFF',
        },
        {
            title: 'Admin — Quản trị',
            description: 'Quản lý dịch vụ, nhân viên, thống kê, cài đặt',
            icon: <LayoutGrid className="w-5 h-5" />,
            href: '/admin',
            color: 'bg-red-50 border-red-200',
            role: 'ADMIN',
        },
    ];

    const openInNewTab = async (href: string, role?: string) => {
        if (role && demoTokens[role]) {
            // Set cookie before opening
            await apiClient.get(`/api/demo-token?role=${role}`);
        }
        window.open(href, '_blank');
    };

    if (isSettingUp) {
        return (
            <div className="min-h-full bg-background px-4 py-12">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-10">
                        <Skeleton className="h-10 w-96 mx-auto mb-3" />
                        <Skeleton className="h-5 w-64 mx-auto" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded-lg border bg-card p-6">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="w-6 h-6" />
                                    <Skeleton className="h-5 w-40" />
                                </div>
                                <Skeleton className="h-4 w-56 mt-3" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-background px-4 py-12">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold tracking-tight">Demo — Hệ thống quản lý hàng đợi</h1>
                    <p className="text-muted-foreground mt-3 text-lg">
                        Khám phá các giao diện của hệ thống. Nhấn vào card để mở trong tab mới.
                    </p>
                </div>

                {/* Public Views */}
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Badge variant="secondary">Public</Badge> Giao diện công khai
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {views.map((view) => (
                            <Card
                                key={view.href}
                                className={`cursor-pointer hover:shadow-lg transition-all ${view.color}`}
                                onClick={() => window.open(view.href, '_blank')}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-3">
                                        {view.icon}
                                        <CardTitle className="text-lg">{view.title}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{view.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Protected Views */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Badge variant="destructive">Auth</Badge> Giao diện yêu cầu đăng nhập
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {protectedViews.map((view) => (
                            <Card
                                key={view.href}
                                className={`cursor-pointer hover:shadow-lg transition-all ${view.color}`}
                                onClick={() => openInNewTab(view.href, view.role)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-3">
                                        {view.icon}
                                        <CardTitle className="text-lg">{view.title}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{view.description}</p>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Demo token: {demoTokens[view.role || ''] ? 'Sẵn sàng' : 'Đang tạo...'}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Demo Credentials */}
                <Card className="mt-8 border-dashed">
                    <CardHeader>
                        <CardTitle className="text-base">Tài khoản demo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="bg-muted p-3 rounded">
                                <p className="font-semibold">Admin</p>
                                <p>Username: <code className="bg-background px-1 rounded">admin</code></p>
                                <p>Password: <code className="bg-background px-1 rounded">admin@2026</code></p>
                            </div>
                            <div className="bg-muted p-3 rounded">
                                <p className="font-semibold">Cán bộ</p>
                                <p>Username: <code className="bg-background px-1 rounded">canbo1</code></p>
                                <p>Password: <code className="bg-background px-1 rounded">canbo1@123</code></p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="text-center mt-8">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Làm mới demo
                    </Button>
                </div>
            </div>
        </div>
    );
}
