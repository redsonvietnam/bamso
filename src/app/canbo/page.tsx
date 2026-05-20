"use client";

import React, { useState, useEffect } from 'react';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth.store';
import QueuePanel from '@/components/staff/QueuePanel';
import { LogOut, ArrowLeft, Monitor } from 'lucide-react';
import { toast } from 'sonner';

export default function CanboPage() {
    const { user, logout, fetchMe } = useAuthStore();
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [selectedPos, setSelectedPos] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    useEffect(() => {
        const fetchServices = async () => {
            try {
                const res = await fetch('/api/services');
                if (res.ok) {
                    const data = await res.json();
                    setServices(data);
                } else {
                    toast.error('Không thể tải danh sách dịch vụ.');
                }
            } catch (error) {
                console.error('Error fetching services:', error);
                toast.error('Lỗi kết nối khi tải dịch vụ.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchServices();
    }, []);

    const handleLogout = async () => {
        await logout();
        window.location.href = '/login';
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50">
                <p className="text-muted-foreground">Đang tải...</p>
            </div>
        );
    }

    // TRẠNG THÁI B: Đã chọn service và quầy → Hiển thị QueuePanel
    if (selectedService && selectedPos) {
        return (
            <div className="min-h-screen bg-zinc-50">
                <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedService(null);
                                setSelectedPos('');
                            }}
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Đổi dịch vụ / Quầy
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold" style={{ color: selectedService.color }}>
                                {selectedService.name}
                            </h1>
                            <p className="text-sm text-muted-foreground">Đang trực tại: {selectedPos}</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
                    </Button>
                </header>
                <QueuePanel serviceId={selectedService.id} pos={selectedPos} />
            </div>
        );
    }

    // TRẠNG THÁI A2: Đã chọn service → Chọn quầy
    if (selectedService) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mb-2 -ml-2 w-fit"
                            onClick={() => setSelectedService(null)}
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại
                        </Button>
                        <CardTitle className="text-2xl text-center">Chọn quầy trực</CardTitle>
                        <CardDescription className="text-center">
                            Bạn đang trực dịch vụ <span className="font-semibold" style={{ color: selectedService.color }}>{selectedService.name}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!selectedPos.trim()) {
                                    toast.error('Vui lòng nhập tên quầy.');
                                    return;
                                }
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="pos">Tên quầy (ví dụ: Quầy 1)</Label>
                                <Input
                                    id="pos"
                                    type="text"
                                    placeholder="Quầy 1"
                                    value={selectedPos}
                                    onChange={(e) => setSelectedPos(e.target.value)}
                                    className="h-10"
                                />
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-10 font-medium"
                                onClick={(e) => {
                                    if (!selectedPos.trim()) {
                                        toast.error('Vui lòng nhập tên quầy.');
                                        e.preventDefault();
                                    }
                                }}
                            >
                                <Monitor className="w-4 h-4 mr-2" /> Bắt đầu trực
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // TRẠNG THÁI A1: Chọn dịch vụ
    return (
        <div className="min-h-screen bg-zinc-50 px-4 py-12">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Chọn dịch vụ bạn sẽ trực hôm nay</h1>
                        <p className="text-muted-foreground mt-1">Xin chào, {user?.name}</p>
                    </div>
                    <Button variant="outline" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map((service) => (
                        <Card
                            key={service.id}
                            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary/50"
                            onClick={() => setSelectedService(service)}
                        >
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                                        style={{ backgroundColor: service.color }}
                                    >
                                        {service.prefix}
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">{service.name}</CardTitle>
                                        <CardDescription>{service.description || 'Không có mô tả'}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                {services.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        Không có dịch vụ nào đang hoạt động.
                    </div>
                )}
            </div>
        </div>
    );
}
