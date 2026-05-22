"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Ticket, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function HomePage() {
    const router = useRouter();
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [mode, setMode] = useState<'quick' | 'form' | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [servicesRes, settingsRes] = await Promise.all([
                    fetch('/api/services'),
                    fetch('/api/settings?key=agency_name'),
                ]);

                if (servicesRes.ok) {
                    setServices(await servicesRes.json());
                }

                if (settingsRes.ok) {
                    const data = await settingsRes.json();
                    if (data.value) setAgencyName(data.value);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error('Không thể tải dữ liệu.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const validatePhone = (value: string) => {
        const regex = /^0\d{9}$/;
        return regex.test(value);
    };

    const handleQuickTicket = async () => {
        if (!selectedService) return;

        setIsCreating(true);
        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceId: selectedService.id }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Lỗi tạo vé.');
            }

            const ticket = await res.json();
            toast.success('Lấy số thành công!');
            router.push(`/track?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateTicket = async () => {
        if (!selectedService) return;

        if (mode === 'form') {
            if (!customerName.trim()) {
                toast.error('Vui lòng nhập tên.');
                return;
            }
            if (!validatePhone(phone)) {
                toast.error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');
                return;
            }
        }

        setIsCreating(true);
        try {
            const body: Record<string, string> = { serviceId: selectedService.id };
            if (mode === 'form') {
                body.customerName = customerName.trim();
                body.phone = phone.trim();
            }

            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Lỗi tạo vé.');
            }

            const ticket = await res.json();
            toast.success('Lấy số thành công!');
            router.push(`/track?ticketId=${ticket.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen px-4 py-12">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-10">
                        <Skeleton className="h-10 w-64 mx-auto mb-3" />
                        <Skeleton className="h-5 w-80 mx-auto" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2].map((i) => (
                            <div key={i} className="rounded-lg border bg-card p-6">
                                <div className="flex items-center gap-4">
                                    <Skeleton className="w-14 h-14 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // BƯỚC 2: Chọn hình thức lấy số
    if (selectedService) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4 py-12">
                <Card className="w-full max-w-md shadow-md">
                    <CardHeader className="text-center">
                        <div
                            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white font-bold text-2xl mb-4"
                            style={{ backgroundColor: selectedService.color }}
                        >
                            {selectedService.prefix}
                        </div>
                        <CardTitle className="text-2xl">{selectedService.name}</CardTitle>
                        <CardDescription>{selectedService.description || ''}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button
                            className="w-full h-12 text-lg font-medium"
                            onClick={() => handleQuickTicket()}
                            disabled={isCreating}
                        >
                            <Ticket className="w-5 h-5 mr-2" /> {isCreating ? 'Đang lấy số...' : 'Lấy số nhanh'}
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full h-12 text-lg font-medium"
                            onClick={() => setMode('form')}
                            disabled={isCreating}
                        >
                            <User className="w-5 h-5 mr-2" /> Lấy số có thông tin
                        </Button>

                        <Button
                            variant="ghost"
                            className="w-full"
                            onClick={() => {
                                setSelectedService(null);
                                setMode(null);
                            }}
                        >
                            Quay lại
                        </Button>

                        {mode === 'form' && (
                            <div className="space-y-4 pt-4 border-t mt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Họ và tên</Label>
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="Nguyễn Văn A"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Số điện thoại</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        placeholder="0901234567"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="h-10"
                                    />
                                </div>
                                <Button
                                    className="w-full h-12 text-lg font-medium"
                                    onClick={handleCreateTicket}
                                    disabled={isCreating}
                                >
                                    {isCreating ? 'Đang tạo...' : 'Xác nhận lấy số'}
                                </Button>
                            </div>
                        )}

                    </CardContent>
                </Card>
            </div>
        );
    }

    // BƯỚC 1: Chọn dịch vụ
    return (
        <div className="min-h-screen px-4 py-12">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground">{agencyName}</h1>
                    <p className="text-muted-foreground mt-2 text-lg">Vui lòng chọn dịch vụ bạn cần sử dụng</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {services.map((service) => (
                        <Card
                            key={service.id}
                            className="cursor-pointer hover:shadow-xl transition-all border-2 hover:border-primary/50 shadow-md"
                            onClick={() => setSelectedService(service)}
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                                        style={{ backgroundColor: service.color }}
                                    >
                                        {service.prefix}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{service.name}</CardTitle>
                                        <CardDescription className="mt-1">
                                            {service.description || 'Nhấn để lấy số'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                {services.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        Hiện chưa có dịch vụ nào đang hoạt động.
                    </div>
                )}
            </div>
        </div>
    );
}
