"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Service, Ticket } from '@prisma/client';
import { toast } from 'sonner';
import { QrCode, Ticket as TicketIcon, User, CheckCircle2, Loader2, ArrowLeft, Volume2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { parseCCCDName } from '@/lib/cccd-parser';
import { useSpeech } from '@/hooks/useSpeech';
import { logger } from '@/lib/logger';
import QRScanner from '@/components/qr-scanner/QRScanner';
import { PageWatermark } from '@/components/ui/dong-son-motif';

type KioskStep = 'service' | 'scan' | 'creating' | 'success';

interface CurrentCall {
    ticketNumber: string;
    pos: string;
    customerName?: string | null;
}

interface QueueState {
    currentCalls: Record<string, CurrentCall>;
    pendingCount: number;
    servicePending: Record<string, number>;
}

const EMPTY_QUEUE: QueueState = {
    currentCalls: {},
    pendingCount: 0,
    servicePending: {},
};

function processTickets(tickets: Ticket[]): QueueState {
    const currentCalls: QueueState['currentCalls'] = {};
    let pendingCount = 0;
    const servicePending: Record<string, number> = {};

    for (const t of tickets) {
        if ((t.status === 'CALLED' || t.status === 'IN_PROGRESS') && t.pos) {
            currentCalls[t.pos] = {
                ticketNumber: t.ticketNumber,
                pos: t.pos,
                customerName: t.customerName,
            };
        }
        if (t.status === 'PENDING') {
            pendingCount++;
            servicePending[t.serviceId] = (servicePending[t.serviceId] || 0) + 1;
        }
    }

    return { currentCalls, pendingCount, servicePending };
}

export default function KioskPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [step, setStep] = useState<KioskStep>('service');
    const [createdTicket, setCreatedTicket] = useState<string | null>(null);
    const [createdCustomerName, setCreatedCustomerName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [queueState, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
    const [isConnected, setIsConnected] = useState(false);
    const [time, setTime] = useState(new Date());
    const [scanError, setScanError] = useState<string | null>(null);
    const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    useEffect(() => {
        let queueConnected = false;
        let displayConnected = false;

        const checkConnected = () => {
            setIsConnected(queueConnected && displayConnected);
        };

        const queueEs = new EventSource('/api/sse/queue');
        queueEs.onopen = () => { queueConnected = true; checkConnected(); };
        queueEs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    setQueueState(processTickets(data.tickets));
                }
            } catch (error) {
                logger.error('Error parsing queue SSE:', error);
            }
        };
        queueEs.onerror = () => { queueConnected = false; checkConnected(); };

        const displayEs = new EventSource('/api/sse/display');
        displayEs.onopen = () => { displayConnected = true; checkConnected(); };
        displayEs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'DISPLAY_CALL') {
                    setQueueState(prev => ({
                        ...prev,
                        currentCalls: {
                            ...prev.currentCalls,
                            [data.pos]: {
                                ticketNumber: data.ticketNumber,
                                pos: data.pos,
                                customerName: data.customerName,
                            },
                        },
                    }));
                }
            } catch (error) {
                logger.error('Error parsing display SSE:', error);
            }
        };
        displayEs.onerror = () => { displayConnected = false; checkConnected(); };

        return () => {
            queueEs.close();
            displayEs.close();
        };
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

    const handleCreateTicket = useCallback(async (customerName?: string) => {
        if (!selectedService) return;

        setStep('creating');
        try {
            const body: Record<string, string> = { serviceId: selectedService.id };
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
            setStep('scan');
        }
    }, [selectedService, speak, resetKiosk]);

    const handleScanSuccess = useCallback((decodedText: string) => {
        unlockAudio();
        const name = parseCCCDName(decodedText);
        if (!name) {
            setScanError('Không thể nhận diện tên từ mã QR. Vui lòng quét lại.');
            return;
        }
        setScanError(null);
        handleCreateTicket(name);
    }, [handleCreateTicket, unlockAudio]);

    const handleScanError = useCallback((error: string) => {
        setScanError(error);
    }, []);

    const currentServing = Object.values(queueState.currentCalls);
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
        <div className="flex flex-col md:flex-row min-h-screen h-screen bg-background overflow-hidden select-none">
            {/* LEFT PANEL — Ticket Flow */}
            <div className="flex-1 md:w-[55%] flex flex-col bg-gradient-to-br from-muted via-card to-primary/5 relative overflow-hidden min-h-0">
                <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[62.5rem] w-[62.5rem] opacity-[0.10]" />
                <div className="h-1.5 bg-brand-red shrink-0" />
                {/* Header */}
                <div className="header-chrome flex items-center justify-between px-4 md:px-8 py-3 md:py-5 bg-white/80 backdrop-blur-sm border-b border-border/60 shrink-0">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-28 h-28 shrink-0 overflow-hidden rounded-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/brand/bca/huy-hieu-cong-an-nhan.png" alt="Logo" className="h-full w-full object-contain" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-lg md:text-xl font-black uppercase tracking-wide text-brand-red">CÔNG AN TỈNH LÂM ĐỒNG</p>
                            <h1 className="text-2xl md:text-3xl font-black uppercase text-foreground">
                                CÔNG AN XÃ NÂM NUNG
                            </h1>
                            <p className="text-sm text-muted-foreground">{agencyName}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-muted-foreground shrink-0">
                        <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">Hệ thống lấy số dịch vụ công</span>
                        <span className="flex items-center gap-2">
                            <Volume2 className="w-4 h-4 hidden md:block" />
                            <span className="text-sm md:text-base font-bold uppercase tracking-widest">{timeStr}</span>
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-y-auto min-h-0">
                    {/* Step: Service Selection */}
                    {step === 'service' && (
                        <div className="w-full max-w-xl space-y-6 md:space-y-8">
                            <div className="text-center space-y-1 md:space-y-2">
                                <h2 className="text-2xl md:text-4xl font-black text-foreground tracking-tight">
                                    Chọn dịch vụ
                                </h2>
                                <p className="text-base md:text-lg text-muted-foreground">
                                    Chạm vào dịch vụ bạn cần
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 md:gap-5">
                                {services.map((service) => (
                                    <button
                                        key={service.id}
                                        onClick={() => {
                                            unlockAudio();
                                            setSelectedService(service);
                                            setStep('scan');
                                        }}
                                        className="group relative flex flex-col items-center gap-3 md:gap-4 p-4 md:p-8 sketch-radius riso-paper-card glass-card rounded-2xl md:rounded-3xl bg-card border-2 border-border 
                                            hover:border-primary hover:shadow-xl hover:shadow-primary/10 
                                            active:scale-[0.97] transition-all duration-200 cursor-pointer"
                                    >
                                        <div
                                            className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-2xl md:text-3xl 
                                                group-hover:scale-110 transition-transform duration-200"
                                            style={{ backgroundColor: service.color }}
                                        >
                                            {service.prefix}
                                        </div>
                                        <div className="text-center min-w-0 w-full">
                                            <p className="text-base md:text-xl font-bold text-foreground truncate">{service.name}</p>
                                            {service.description && (
                                                <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 truncate">{service.description}</p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {services.length === 0 && (
                                <div className="text-center py-10 md:py-16 text-muted-foreground text-lg md:text-xl">
                                    Hiện chưa có dịch vụ nào
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: QR Scan */}
                    {step === 'scan' && selectedService && (
                        <div className="w-full max-w-xl space-y-4 md:space-y-6">
                            <button
                                onClick={() => { setStep('service'); setSelectedService(null); setScanError(null); }}
                                className="flex items-center gap-2 text-muted-foreground hover:text-muted-foreground active:scale-95 transition-all"
                            >
                                <ArrowLeft className="w-5 h-5" />
                                <span className="font-medium text-sm md:text-base">Đổi dịch vụ</span>
                            </button>

                            <div className="text-center space-y-2">
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

                            <div className="relative w-full aspect-[4/3] max-h-[50vh] rounded-2xl md:rounded-3xl overflow-hidden bg-black shadow-2xl">
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

                            <div className="text-center">
                                <p className="text-xs md:text-sm text-muted-foreground">
                                    Hoặc{' '}
                                    <button
                                        onClick={() => handleCreateTicket()}
                                        className="text-primary font-bold underline underline-offset-2 hover:no-underline"
                                    >
                                        lấy số nhanh không cần quét
                                    </button>
                                </p>
                            </div>
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

            {/* RIGHT PANEL — Live Queue */}
            <div className="h-72 md:h-auto md:w-[45%] flex flex-col bg-card border-t md:border-t-0 md:border-l border-border overflow-hidden min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between px-4 md:px-8 py-3 md:py-5 border-b border-border/60 shrink-0">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-2 md:w-2.5 h-7 md:h-10 bg-brand-gold rounded-full shrink-0" />
                        <h2 className="text-lg md:text-2xl font-black text-foreground tracking-tight uppercase">
                            Đang phục vụ
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 sticker px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-muted border border-border">
                        <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            {isConnected ? 'Trực tuyến' : 'Mất kết nối'}
                        </span>
                    </div>
                </div>

                {/* Queue Content */}
                <div className="flex-1 p-3 md:p-8 overflow-y-auto min-h-0">
                    {currentServing.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 md:gap-6">
                            {currentServing.map((call) => (
                                <div
                                    key={call.pos}
                                    className="relative flex flex-col items-center justify-center p-4 md:p-8 rounded-2xl md:rounded-3xl 
                                        bg-gradient-to-br from-primary/5 to-primary/10 
                                        border-2 border-primary/20 shadow-lg shadow-primary/5"
                                >
                                    <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3">
                                        <span className="w-1.5 h-1.5 md:w-2.5 md:h-2.5 rounded-full bg-primary animate-pulse" />
                                        <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest text-primary">
                                            {call.pos}
                                        </span>
                                    </div>
                                    <p className="text-3xl md:text-6xl font-black text-foreground tracking-tighter">
                                        {call.ticketNumber}
                                    </p>
                                    {call.customerName && (
                                        <p className="mt-1 md:mt-2 text-xs md:text-sm text-muted-foreground font-medium flex items-center gap-1 truncate max-w-full">
                                            <User className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
                                            <span className="truncate">{call.customerName}</span>
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-3 md:space-y-4">
                            <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-muted flex items-center justify-center">
                                <TicketIcon className="w-7 h-7 md:w-10 md:h-10 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-lg md:text-2xl font-bold text-muted-foreground">Đang chờ gọi số</p>
                                <p className="text-sm md:text-base text-muted-foreground mt-1">
                                    {queueState.pendingCount > 0
                                        ? `${queueState.pendingCount} phiếu đang chờ`
                                        : 'Chưa có phiếu chờ'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Waiting Summary */}
                    {queueState.pendingCount > 0 && (
                        <div className="mt-4 md:mt-8 pt-4 md:pt-6 border-t border-border">
                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 md:mb-3">
                                Đang chờ phục vụ
                            </p>
                            <div className="flex flex-wrap gap-2 md:gap-3">
                                {services.map((service) => {
                                    const count = queueState.servicePending[service.id] || 0;
                                    if (count === 0) return null;
                                    return (
                                        <div
                                            key={service.id}
                                            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl bg-muted border border-border"
                                        >
                                            <div
                                                className="w-2 h-2 md:w-3 md:h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: service.color }}
                                            />
                                            <span className="text-xs md:text-sm font-medium text-muted-foreground truncate">{service.name}</span>
                                            <span className="text-xs md:text-sm font-bold text-foreground">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
