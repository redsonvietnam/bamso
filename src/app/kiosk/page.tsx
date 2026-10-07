"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Service } from '@prisma/client';
import { toast } from 'sonner';
import { QrCode, CheckCircle2, Loader2, ArrowLeft, Volume2, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { parseCCCDName } from '@/lib/cccd-parser';
import { useSpeech } from '@/hooks/useSpeech';
import QRScanner from '@/components/qr-scanner/QRScanner';
import { PageWatermark } from '@/components/ui/dong-son-motif';
import DisplayBoard from '@/components/display/DisplayBoard';
import { ServiceActionCards } from '@/components/customer/ServiceActionCards';
import KioskQueuePeek from '@/components/customer/KioskQueuePeek';

type KioskStep = 'service' | 'scan' | 'creating' | 'success';

export default function KioskPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [step, setStep] = useState<KioskStep>('service');
    const [createdTicket, setCreatedTicket] = useState<string | null>(null);
    const [createdCustomerName, setCreatedCustomerName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [time, setTime] = useState(new Date());
    const [scanError, setScanError] = useState<string | null>(null);
    const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ticketSubmissionLockRef = useRef(false);
    const { speak, unlockAudio } = useSpeech();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [servicesRes, settingsRes] = await Promise.all([
                    apiClient.get<Service[]>('/api/services'),
                    apiClient.get<{ value: string }>('/api/settings?key=agency_name'),
                ]);
                setServices(servicesRes);
                if (settingsRes.value) setAgencyName(settingsRes.value);
            } catch {
                toast.error('Không thể tải dữ liệu.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const clearAutoReset = useCallback(() => {
        if (autoResetRef.current) {
            clearTimeout(autoResetRef.current);
            autoResetRef.current = null;
        }
    }, []);

    const resetKiosk = useCallback(() => {
        clearAutoReset();
        setStep('service');
        setSelectedService(null);
        setCreatedTicket(null);
        setCreatedCustomerName(null);
        setScanError(null);
    }, [clearAutoReset]);

    const handleCreateTicket = useCallback(async (service: Service, customerName?: string) => {
        if (ticketSubmissionLockRef.current) return;
        ticketSubmissionLockRef.current = true;
        setSelectedService(service);
        setStep('creating');
        try {
            const body: Record<string, string> = { serviceId: service.id };
            if (customerName) body.customerName = customerName;

            const ticket = await apiClient.post<{ ticketNumber: string }>('/api/tickets', body);
            setCreatedTicket(ticket.ticketNumber);
            setCreatedCustomerName(customerName || null);
            setStep('success');

            speak(`Đã lấy số ${ticket.ticketNumber}. Vui lòng chờ gọi.`);

            autoResetRef.current = setTimeout(() => {
                resetKiosk();
            }, 5000);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
            setStep('service');
        } finally {
            ticketSubmissionLockRef.current = false;
        }
    }, [speak, resetKiosk]);

    const handleScanSuccess = useCallback((decodedText: string) => {
        unlockAudio();
        const name = parseCCCDName(decodedText);
        if (!name) {
            setScanError('Không thể nhận diện tên từ mã QR. Vui lòng quét lại.');
            return;
        }
        setScanError(null);
        if (selectedService) handleCreateTicket(selectedService, name);
    }, [handleCreateTicket, selectedService, unlockAudio]);

    const handleScanError = useCallback((error: string) => {
        setScanError(error);
    }, []);

    const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (isLoading) {
        return (
            <div className="flex flex-col md:flex-row h-screen w-screen bg-muted">
                <div className="flex-1 flex items-center justify-center p-6 md:p-12">
                    <div className="space-y-6 md:space-y-8 w-full max-w-lg">
                        <Skeleton className="h-10 md:h-12 w-56 md:w-64 mx-auto" />
                        <Skeleton className="h-5 md:h-6 w-64 md:w-80 mx-auto" />
                        <div className="grid grid-cols-2 gap-4 md:gap-6">
                            {[1, 2].map(i => (
                                <Skeleton key={i} className="h-28 md:h-32 rounded-2xl" />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="h-64 md:h-auto md:w-[45%] bg-card border-t md:border-t-0 md:border-l border-border p-6 md:p-8">
                    <Skeleton className="h-7 md:h-8 w-40 md:w-48 mb-4 md:mb-6" />
                    <div className="grid grid-cols-2 gap-4 md:gap-6">
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-28 md:h-36 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row min-h-dvh h-dvh bg-background overflow-hidden select-none">
            {/* LEFT PANEL — Ticket Flow */}
            <div className="flex-1 md:w-[55%] flex flex-col bg-gradient-to-br from-muted via-card to-primary/5 relative overflow-hidden min-h-0">
                <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[62.5rem] w-[62.5rem] opacity-[0.10]" />
                <div className="h-1.5 bg-brand-red shrink-0" />
                {/* Header */}
                <div className="relative z-10 header-chrome flex items-center justify-between px-3 py-1.5 md:px-8 md:py-5 bg-white/80 backdrop-blur-sm border-b border-border/60 shrink-0">
                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <div className="w-9 h-9 md:w-28 md:h-28 shrink-0 overflow-hidden rounded-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/brand/bca/huy-hieu-cong-an-nhan.png" alt="Logo" className="h-full w-full object-contain" />
                        </div>
                        <div className="min-w-0 overflow-hidden">
                            <p className="truncate text-xs md:text-xl font-black uppercase tracking-wide text-brand-red">CÔNG AN TỈNH LÂM ĐỒNG</p>
                            <h1 className="truncate text-base md:text-3xl font-black uppercase text-foreground">
                                {agencyName}
                            </h1>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-0 md:gap-1 text-muted-foreground shrink-0">
                        <span className="hidden md:block text-xs font-bold uppercase tracking-widest">Hệ thống lấy số dịch vụ công</span>
                        <span className="flex items-center gap-2">
                            <Volume2 className="w-4 h-4 hidden md:block" />
                            <span className="text-xs md:text-base font-bold uppercase tracking-widest">{timeStr}</span>
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex-1 flex items-start md:items-center justify-center p-3 md:p-8 overflow-y-auto min-h-0">
                    {/* Step: Service Selection */}
                    {step === 'service' && (
                        <div className="w-full max-w-xl space-y-4 md:space-y-8">
                            <div className="text-center space-y-0.5 md:space-y-2">
                                <h2 className="text-xl md:text-4xl font-black text-foreground tracking-tight">
                                    Chọn dịch vụ
                                </h2>
                                <p className="hidden md:block text-lg text-muted-foreground">
                                    Chạm vào dịch vụ bạn cần
                                </p>
                            </div>

                            <ServiceActionCards
                                services={services}
                                mode="kiosk"
                                compact
                                onQuick={() => undefined}
                                onManual={(service, name) => {
                                    unlockAudio();
                                    setScanError(null);
                                    if (name !== undefined) {
                                        void handleCreateTicket(service, name.trim());
                                    }
                                }}
                                onQr={(service) => {
                                    unlockAudio();
                                    setSelectedService(service);
                                                                setScanError(null);
                                    setStep('scan');
                                }}
                            />

                            <KioskQueuePeek />

                            {services.length === 0 && (
                                <div className="text-center py-10 md:py-16 text-muted-foreground text-lg md:text-xl">
                                    Hiện chưa có dịch vụ nào
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: QR Scan */}
                    {step === 'scan' && selectedService && (
                        <div className="w-full h-full max-w-xl flex flex-col gap-2 md:h-auto md:space-y-6 md:block">
                            <button
                                onClick={() => { setStep('service'); setSelectedService(null); setScanError(null); }}
                                className="flex items-center gap-2 text-muted-foreground hover:text-muted-foreground active:scale-95 transition-all"
                            >
                                <ArrowLeft className="w-5 h-5" />
                                <span className="font-medium text-sm md:text-base">Đổi dịch vụ</span>
                            </button>

                            <div className="hidden md:block text-center space-y-2">
                                <div
                                    className="w-12 h-12 md:w-16 md:h-16 rounded-xl mx-auto flex items-center justify-center text-white font-black text-xl md:text-2xl"
                                    style={{ backgroundColor: selectedService.color }}
                                >
                                    {selectedService.prefix}
                                </div>
                                <h2 className="text-xl md:text-3xl font-black text-foreground tracking-tight">
                                    Quét CCCD / VNeID
                                </h2>
                                <p className="text-sm md:text-base text-muted-foreground">
                                    Đưa mã QR vào khung camera
                                </p>
                            </div>

                            <div className="relative w-full flex-1 min-h-0 md:flex-none md:aspect-[4/3] md:min-h-0 md:max-h-[50vh] rounded-2xl md:rounded-3xl overflow-hidden bg-black shadow-2xl">
                                <QRScanner
                                    onScanSuccess={handleScanSuccess}
                                    onScanError={handleScanError}
                                />
                            </div>

                            {scanError && (
                                <div className="text-center space-y-3">
                                    <p className="text-red-500 font-medium text-sm md:text-base">{scanError}</p>
                                    <button
                                        onClick={() => setScanError(null)}
                                        className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 rounded-xl bg-primary text-white font-bold text-sm md:text-base
                                            active:scale-95 transition-transform"
                                    >
                                        <QrCode className="w-4 h-4 md:w-5 md:h-5" />
                                        Quét lại
                                    </button>
                                </div>
                            )}

                        </div>
                    )}

                    {/* Step: Creating */}
                    {step === 'creating' && (
                        <div className="text-center space-y-4 md:space-y-6">
                            <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-primary animate-spin mx-auto" />
                            <p className="text-xl md:text-2xl font-bold text-muted-foreground">Đang tạo phiếu...</p>
                        </div>
                    )}

                    {/* Step: Success */}
                    {step === 'success' && createdTicket && (
                        <div className="text-center space-y-4 md:space-y-6 animate-in fade-in zoom-in duration-300">
                            <CheckCircle2 className="w-16 h-16 md:w-20 md:h-20 text-primary mx-auto" />
                            <div className="space-y-1 md:space-y-2">
                                <p className="text-lg md:text-xl text-muted-foreground font-medium">Số phiếu của bạn là</p>
                                <p className="text-6xl md:text-[7rem] font-black leading-none tracking-tighter text-primary">
                                    {createdTicket}
                                </p>
                                {createdCustomerName && (
                                <p className="text-base md:text-lg text-muted-foreground">
                                        <User className="w-4 h-4 inline mr-1" />
                                        {createdCustomerName}
                                    </p>
                                )}
                            </div>
                            <p className="text-sm md:text-base text-muted-foreground">
                                Vui lòng chờ gọi số tại khu vực chờ
                            </p>
                            <p className="text-xs md:text-sm text-muted-foreground animate-pulse">
                                Tự động quay về sau 5 giây...
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL — Display Board */}
            <div className="hidden md:flex md:h-auto md:w-[45%] flex-col bg-card border-l border-border overflow-hidden min-h-0">
                <DisplayBoard variant="compact" />
            </div>
        </div>
    );
}
