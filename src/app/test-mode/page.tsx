"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Service, Ticket } from '@prisma/client';
import { toast } from 'sonner';
import { QrCode, Ticket as TicketIcon, User, CheckCircle2, Loader2, Volume2, Camera, CameraOff, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { QRCodeSVG } from 'qrcode.react';
import { apiClient } from '@/lib/api-client';
import { parseCCCDName } from '@/lib/cccd-parser';
import { useSpeech } from '@/hooks/useSpeech';
import { logger } from '@/lib/logger';
import QRScanner from '@/components/qr-scanner/QRScanner';

type TestStep = 'ready' | 'service-select' | 'creating' | 'success';

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

export default function TestModePage() {
    const [services, setServices] = useState<Service[]>([]);
    const [agencyName, setAgencyName] = useState('Hệ thống quản lý hàng đợi');
    const [step, setStep] = useState<TestStep>('ready');
    const [pendingName, setPendingName] = useState<string | null>(null);
    const [createdTicket, setCreatedTicket] = useState<string | null>(null);
    const [createdCustomerName, setCreatedCustomerName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [queueState, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
    const [isConnected, setIsConnected] = useState(false);
    const [time, setTime] = useState(new Date());
    const [scanError, setScanError] = useState<string | null>(null);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [scanKey, setScanKey] = useState(0);
    const [origin] = useState(() => typeof window !== 'undefined' ? window.location.origin : '');
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

    const reset = useCallback(() => {
        clearAutoReset();
        setStep('ready');
        setPendingName(null);
        setCreatedTicket(null);
        setCreatedCustomerName(null);
        setScanError(null);
        setScanKey(k => k + 1);
    }, [clearAutoReset]);

    const handleCreateTicket = useCallback(async (serviceId: string, customerName?: string) => {
        setStep('creating');
        try {
            const body: Record<string, string> = { serviceId };
            if (customerName) body.customerName = customerName;

            const ticket = await apiClient.post<{ ticketNumber: string }>('/api/tickets', body);
            setCreatedTicket(ticket.ticketNumber);
            setCreatedCustomerName(customerName || null);
            setStep('success');

            speak(`Đã lấy số ${ticket.ticketNumber}. Vui lòng chờ gọi.`);

            autoResetRef.current = setTimeout(() => {
                reset();
            }, 5000);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo vé.');
            setStep('ready');
            setScanKey(k => k + 1);
        }
    }, [speak, reset]);

    const handleScanSuccess = useCallback((decodedText: string) => {
        unlockAudio();
        const name = parseCCCDName(decodedText);
        if (!name) {
            setScanError('Không thể nhận diện tên từ mã QR. Vui lòng quét lại.');
            setScanKey(k => k + 1);
            return;
        }
        setScanError(null);

        if (services.length === 1) {
            handleCreateTicket(services[0].id, name);
        } else {
            setPendingName(name);
            setStep('service-select');
        }
    }, [services, handleCreateTicket, unlockAudio]);

    const handleScanError = useCallback((error: string) => {
        setScanError(error);
    }, []);

    const currentServing = Object.values(queueState.currentCalls);
    const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const getTicketUrl = `${origin}/get-ticket`;

    if (isLoading) {
        return (
            <div className="flex flex-row h-screen w-screen bg-slate-50">
                <div className="flex-1 flex flex-col gap-4 p-6">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="flex-1 rounded-2xl" />
                    <Skeleton className="h-36 rounded-2xl" />
                </div>
                <div className="w-[45%] bg-white border-l border-slate-200 p-6">
                    <Skeleton className="h-8 w-40 mb-6" />
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-32 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-row h-screen w-screen bg-slate-50 overflow-hidden select-none">

            {/* SERVICE SELECT MODAL OVERLAY */}
            {step === 'service-select' && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Chọn dịch vụ</h2>
                                {pendingName && (
                                    <p className="text-sm text-slate-500 flex items-center gap-1">
                                        <User className="w-3.5 h-3.5" />
                                        {pendingName}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={reset}
                                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {services.map((service) => (
                                <button
                                    key={service.id}
                                    onClick={() => {
                                        handleCreateTicket(service.id, pendingName || undefined);
                                    }}
                                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-slate-50 border-2 border-slate-100
                                        hover:border-[#00BD7D] hover:shadow-lg hover:shadow-[#00BD7D]/10
                                        active:scale-[0.97] transition-all duration-200 cursor-pointer"
                                >
                                    <div
                                        className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-2xl
                                            group-hover:scale-110 transition-transform duration-200"
                                        style={{ backgroundColor: service.color }}
                                    >
                                        {service.prefix}
                                    </div>
                                    <p className="text-sm font-bold text-slate-800 text-center leading-tight">{service.name}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* LEFT PANEL */}
            <div className="flex-1 w-[55%] flex flex-col bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 relative overflow-hidden min-h-0">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2.5 h-8 bg-[#00BD7D] rounded-full shrink-0" />
                        <h1 className="text-xl font-black tracking-tight truncate" style={{ color: '#00BD7D' }}>
                            {agencyName}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 shrink-0">
                        <Volume2 className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">{timeStr}</span>
                    </div>
                </div>

                {/* Camera section */}
                <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden min-h-0">

                    {/* Camera panel */}
                    <div className="flex-1 relative rounded-2xl overflow-hidden bg-black shadow-xl min-h-0">
                        {/* Toggle button — top right of camera */}
                        <button
                            onClick={() => {
                                unlockAudio();
                                setCameraEnabled(v => !v);
                                if (!cameraEnabled) setScanKey(k => k + 1);
                            }}
                            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                bg-black/50 backdrop-blur-sm border border-white/20 text-white text-xs font-bold
                                hover:bg-black/70 active:scale-95 transition-all"
                        >
                            {cameraEnabled
                                ? <><CameraOff className="w-3.5 h-3.5" /> Tắt camera</>
                                : <><Camera className="w-3.5 h-3.5" /> Bật camera</>
                            }
                        </button>

                        {cameraEnabled && (step === 'ready' || step === 'service-select') ? (
                            <QRScanner
                                key={scanKey}
                                onScanSuccess={handleScanSuccess}
                                onScanError={handleScanError}
                            />
                        ) : step === 'creating' ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
                                <Loader2 className="w-14 h-14 text-[#00BD7D] animate-spin" />
                                <p className="text-white text-xl font-bold">Đang tạo phiếu...</p>
                            </div>
                        ) : step === 'success' && createdTicket ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 to-emerald-950 animate-in fade-in duration-300">
                                <CheckCircle2 className="w-16 h-16 text-[#00BD7D]" />
                                <div className="text-center space-y-1">
                                    <p className="text-slate-300 text-lg font-medium">Số phiếu của bạn là</p>
                                    <p className="text-[5rem] font-black leading-none tracking-tighter" style={{ color: '#00BD7D' }}>
                                        {createdTicket}
                                    </p>
                                    {createdCustomerName && (
                                        <p className="text-slate-300 text-base flex items-center justify-center gap-1.5">
                                            <User className="w-4 h-4" />
                                            {createdCustomerName}
                                        </p>
                                    )}
                                </div>
                                <p className="text-slate-400 text-sm">Vui lòng chờ gọi số tại khu vực chờ</p>
                                <p className="text-slate-600 text-xs animate-pulse">Tự động quay về sau 5 giây...</p>
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
                                <CameraOff className="w-10 h-10 text-slate-600" />
                                <p className="text-slate-500 text-sm font-medium">Camera đã tắt</p>
                                <button
                                    onClick={() => { setCameraEnabled(true); setScanKey(k => k + 1); }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00BD7D] text-white text-sm font-bold
                                        active:scale-95 transition-transform"
                                >
                                    <Camera className="w-4 h-4" /> Bật camera
                                </button>
                            </div>
                        )}

                        {/* Scan error banner */}
                        {scanError && cameraEnabled && step === 'ready' && (
                            <div className="absolute bottom-0 left-0 right-0 z-10 bg-red-600/90 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-3">
                                <p className="text-white text-sm font-medium flex items-center gap-2">
                                    <QrCode className="w-4 h-4 shrink-0" />
                                    {scanError}
                                </p>
                                <button
                                    onClick={() => setScanError(null)}
                                    className="text-white/70 hover:text-white shrink-0"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Ready overlay hint */}
                        {cameraEnabled && step === 'ready' && !scanError && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                                <p className="text-white/70 bg-black/40 backdrop-blur-sm text-xs font-medium px-4 py-1.5 rounded-full">
                                    Đưa CCCD / VNeID vào khung hình để lấy số
                                </p>
                            </div>
                        )}
                    </div>

                    {/* QR Code panel — bottom */}
                    <div className="shrink-0 flex items-center gap-5 bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
                        <div className="shrink-0 p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <QRCodeSVG
                                value={getTicketUrl}
                                size={80}
                                level="M"
                                fgColor="#1e293b"
                            />
                        </div>
                        <div className="min-w-0 space-y-1">
                            <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Lấy số qua điện thoại</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Quét mã QR bằng điện thoại để truy cập trang lấy số nhanh
                            </p>
                            <p className="text-[10px] text-slate-300 font-mono truncate">{getTicketUrl}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL — Live Queue */}
            <div className="w-[45%] flex flex-col bg-white border-l border-slate-200 overflow-hidden min-h-0">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-8 bg-slate-800 rounded-full shrink-0" />
                        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Đang phục vụ</h2>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00BD7D] animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {isConnected ? 'Trực tuyến' : 'Mất kết nối'}
                        </span>
                    </div>
                </div>

                {/* Queue Content */}
                <div className="flex-1 p-5 overflow-y-auto min-h-0">
                    {currentServing.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                            {currentServing.map((call) => (
                                <div
                                    key={call.pos}
                                    className="relative flex flex-col items-center justify-center p-6 rounded-3xl
                                        bg-gradient-to-br from-[#00BD7D]/5 to-[#00BD7D]/10
                                        border-2 border-[#00BD7D]/20 shadow-lg shadow-[#00BD7D]/5"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-[#00BD7D] animate-pulse" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-[#00BD7D]">
                                            {call.pos}
                                        </span>
                                    </div>
                                    <p className="text-5xl font-black text-slate-800 tracking-tighter">
                                        {call.ticketNumber}
                                    </p>
                                    {call.customerName && (
                                        <p className="mt-2 text-xs text-slate-500 font-medium flex items-center gap-1 truncate max-w-full">
                                            <User className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{call.customerName}</span>
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
                                <TicketIcon className="w-9 h-9 text-slate-300" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-300">Đang chờ gọi số</p>
                                <p className="text-sm text-slate-400 mt-1">
                                    {queueState.pendingCount > 0
                                        ? `${queueState.pendingCount} phiếu đang chờ`
                                        : 'Chưa có phiếu chờ'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Waiting summary */}
                    {queueState.pendingCount > 0 && (
                        <div className="mt-6 pt-5 border-t border-slate-100">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                                Đang chờ phục vụ
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {services.map((service) => {
                                    const count = queueState.servicePending[service.id] || 0;
                                    if (count === 0) return null;
                                    return (
                                        <div
                                            key={service.id}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100"
                                        >
                                            <div
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: service.color }}
                                            />
                                            <span className="text-xs font-medium text-slate-600 truncate">{service.name}</span>
                                            <span className="text-xs font-bold text-slate-800">{count}</span>
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
