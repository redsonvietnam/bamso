"use client";

import React, { useState, useEffect } from 'react';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Ticket, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function KioskPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [phone, setPhone] = useState('');
    const [createdTicket, setCreatedTicket] = useState<string | null>(null);
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

    // Auto-reset after showing ticket number for 5 seconds
    useEffect(() => {
        if (createdTicket) {
            const timer = setTimeout(() => {
                setCreatedTicket(null);
                setSelectedService(null);
                setCustomerName('');
                setPhone('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [createdTicket]);

    const validatePhone = (value: string) => {
        const regex = /^0\d{9}$/;
        return regex.test(value);
    };

    const handleCreateTicket = async () => {
        if (!selectedService) return;

        if (!customerName.trim()) {
            toast.error('Vui lòng nhập tên.');
            return;
        }
        if (!validatePhone(phone)) {
            toast.error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');
            return;
        }

        setIsCreating(true);
        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serviceId: selectedService.id,
                    customerName: customerName.trim(),
                    phone: phone.trim(),
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Lỗi tạo vé.');
            }

            const ticket = await res.json();
            setCreatedTicket(ticket.ticketNumber);
            toast.success('Lấy số thành công!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
        } finally {
            setIsCreating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-16">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <Skeleton className="h-12 w-72 mx-auto mb-4" />
                        <Skeleton className="h-6 w-96 mx-auto" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {[1, 2].map((i) => (
                            <div key={i} className="rounded-lg border bg-card p-10">
                                <div className="flex items-center gap-6">
                                    <Skeleton className="w-20 h-20 rounded-full" />
                                    <div className="flex-1 space-y-3">
                                        <Skeleton className="h-8 w-44" />
                                        <Skeleton className="h-5 w-28" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // MÀN HÌNH HIỂN THỊ SỐ PHIẾU SAU KHI LẤY
    if (createdTicket) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4">
                <Card className="w-full max-w-2xl text-center shadow-2xl border-4 border-primary/20">
                    <CardContent className="pt-16 pb-16 space-y-8">
                        <p className="text-3xl text-muted-foreground font-medium">Số phiếu của bạn là</p>
                        <p className="text-9xl font-black text-primary tracking-tighter">{createdTicket}</p>
                        <p className="text-xl text-muted-foreground">
                            Vui lòng đến khu vực chờ. Số sẽ được gọi trên bảng điện tử.
                        </p>
                        <p className="text-lg text-muted-foreground mt-8 animate-pulse">
                            Màn hình sẽ tự động quay về sau 5 giây...
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // MÀN HÌNH NHẬP THÔNG TIN (Kiosk bắt buộc nhập tên)
    if (selectedService) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-12">
                <Card className="w-full max-w-lg shadow-xl">
                    <CardHeader className="text-center">
                        <Button
                            variant="ghost"
                            size="lg"
                            className="mb-4 -ml-2 w-fit"
                            onClick={() => {
                                setSelectedService(null);
                                setCustomerName('');
                                setPhone('');
                            }}
                        >
                            <ArrowLeft className="w-6 h-6 mr-2" /> Quay lại
                        </Button>
                        <div
                            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white font-bold text-3xl mb-4"
                            style={{ backgroundColor: selectedService.color }}
                        >
                            {selectedService.prefix}
                        </div>
                        <CardTitle className="text-3xl">{selectedService.name}</CardTitle>
                        <CardDescription className="text-lg mt-2">
                            Vui lòng nhập thông tin để lấy số
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-lg">Họ và tên</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="Nguyễn Văn A"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                className="h-14 text-lg"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-lg">Số điện thoại</Label>
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="0901234567"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="h-14 text-lg"
                            />
                        </div>
                        <Button
                            className="w-full h-16 text-xl font-bold"
                            size="lg"
                            onClick={handleCreateTicket}
                            disabled={isCreating}
                        >
                            <Ticket className="w-6 h-6 mr-3" />
                            {isCreating ? 'Đang tạo...' : 'Lấy số'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // MÀN HÌNH CHỌN DỊCH VỤ
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-16">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-5xl font-bold tracking-tight">{agencyName}</h1>
                    <p className="text-muted-foreground mt-4 text-2xl">Vui lòng chọn dịch vụ bạn cần sử dụng</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {services.map((service) => (
                        <Card
                            key={service.id}
                            className="cursor-pointer hover:shadow-2xl transition-all border-4 hover:border-primary/50"
                            onClick={() => setSelectedService(service)}
                        >
                            <CardHeader className="py-10">
                                <div className="flex items-center gap-6">
                                    <div
                                        className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-4xl"
                                        style={{ backgroundColor: service.color }}
                                    >
                                        {service.prefix}
                                    </div>
                                    <div>
                                        <CardTitle className="text-3xl">{service.name}</CardTitle>
                                        <CardDescription className="mt-2 text-lg">
                                            {service.description || 'Nhấn để lấy số'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                {services.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground text-2xl">
                        Hiện chưa có dịch vụ nào đang hoạt động.
                    </div>
                )}
            </div>
        </div>
    );
}
