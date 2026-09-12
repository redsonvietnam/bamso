"use client";

import { useState, useEffect, useMemo } from 'react';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    CheckCircle,
    XCircle,
    RotateCcw,
    Users,
    UserPlus,
    Monitor,
    History,
    AlertCircle,
    Volume2,
    VolumeX
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueueStore, type QueueLifecycleStatus } from '@/stores/queue.store';
import { useSpeech } from '@/hooks/useSpeech';
import { apiClient } from '@/lib/api-client';

interface QueuePanelProps {
    serviceId: string;
    pos: string;
}

// Queue actions are REST-based and stay available when the SSE channel is
// down. Gating depends only on the in-flight action request and queue
// content — never on realtime connection status.
export function isCallNextDisabled(isActionLoading: boolean, pendingCount: number): boolean {
    return isActionLoading || pendingCount === 0;
}

function statusBadge(status: QueueLifecycleStatus): { text: string; variant: 'secondary' | 'destructive' | 'outline' } {
    switch (status) {
        case 'connected':
            return { text: 'Real-time On', variant: 'secondary' };
        case 'initial-loading':
            return { text: 'Đang tải...', variant: 'outline' };
        case 'connecting':
            return { text: 'Đang kết nối...', variant: 'outline' };
        case 'reconnecting':
            return { text: 'Mất kết nối — dữ liệu cũ', variant: 'destructive' };
        case 'load-error':
            return { text: 'Lỗi tải dữ liệu', variant: 'destructive' };
        case 'disconnected':
        default:
            return { text: 'Disconnected', variant: 'destructive' };
    }
}

export default function QueuePanel({ serviceId, pos }: QueuePanelProps) {
    const { tickets, status, loadError, connectSSE, disconnectSSE } = useQueueStore();
    const [isLoading, setIsLoading] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const { speak } = useSpeech();

    useEffect(() => {
        connectSSE(serviceId);
        return () => disconnectSSE();
    }, [serviceId, connectSSE, disconnectSSE]);

    const currentTicket = useMemo(() => {
        return tickets.find(t =>
            t.pos === pos &&
            (t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS)
        );
    }, [tickets, pos]);

    const pendingTickets = useMemo(() => {
        return tickets.filter(t => t.status === TicketStatus.PENDING);
    }, [tickets]);

    const nextPendingTicket = useMemo(() => {
        return pendingTickets.length > 0 ? pendingTickets[0] : null;
    }, [pendingTickets]);

    const missedTickets = useMemo(() => {
        return tickets.filter(t => t.status === TicketStatus.MISSED);
    }, [tickets]);

    // Speak when current ticket changes (i.e., after call-next)
    useEffect(() => {
        if (currentTicket && soundEnabled) {
            speak(`Mời số ${currentTicket.ticketNumber} đến ${pos} để phục vụ`);
        }
        // only run when currentTicket.id changes (new ticket called)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTicket?.id, pos, soundEnabled]);

    // Speak next pending ticket when current changes
    useEffect(() => {
        if (nextPendingTicket && currentTicket && soundEnabled) {
            // Small delay so this announcement comes after the current ticket call
            const timer = setTimeout(() => {
                speak(`Số ${nextPendingTicket.ticketNumber} chuẩn bị`);
            }, 2000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTicket?.id, nextPendingTicket?.id, soundEnabled]);

    const handleAction = async (url: string, method: string, body: object, successMsg: string) => {
        setIsLoading(true);
        try {
            if (method === 'POST') {
                await apiClient.post(url, body);
            } else if (method === 'PUT') {
                await apiClient.put(url, body);
            } else {
                await apiClient.delete(url);
            }

            toast.success(successMsg);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Thao tác thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const callNext = () => handleAction('/api/queue/call-next', 'POST', { serviceId, pos }, 'Đã gọi số tiếp theo');
    const complete = () => currentTicket && handleAction('/api/queue/complete', 'PUT', { ticketId: currentTicket.id }, 'Đã hoàn thành phục vụ');
    const skip = () => currentTicket && handleAction('/api/queue/skip', 'PUT', { ticketId: currentTicket.id }, 'Đã bỏ qua số thứ tự');
    const recall = () => handleAction('/api/queue/recall', 'POST', { serviceId, pos }, 'Đã phát lại thông báo');
    const restore = (ticketId: string) => handleAction('/api/queue/restore', 'PUT', { ticketId }, 'Đã khôi phục vé vào hàng đợi');

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 p-4 h-full max-w-7xl mx-auto">

            <div className="md:col-span-2 space-y-4 md:space-y-6">
                <Card className="border-2 border-primary/20 shadow-lg overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b py-3 sm:py-6">
                        <div className="flex justify-between items-center gap-2 flex-wrap">
                            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                <Monitor className="w-5 h-5 text-primary" />
                                {pos} - Đang phục vụ
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSoundEnabled(!soundEnabled)}
                                    className={`rounded-full ${soundEnabled ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                                    title={soundEnabled ? 'Tắt âm thanh thông báo' : 'Bật âm thanh thông báo'}
                                >
                                    {soundEnabled ? <Volume2 /> : <VolumeX />}
                                </Button>
                                <Badge variant={statusBadge(status).variant}>
                                    {statusBadge(status).text}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    {(status === 'reconnecting' || status === 'disconnected') && tickets.length > 0 && (
                        <div className="bg-destructive/10 text-destructive text-xs sm:text-sm font-medium px-4 py-2 text-center">
                            Mất kết nối realtime — đang hiển thị dữ liệu cũ. Các thao tác vẫn khả dụng.
                        </div>
                    )}
                    <CardContent className="pt-6 pb-6 sm:pt-8 sm:pb-8 text-center">
                        {status === 'initial-loading' ? (
                            <div className="py-8 sm:py-12 space-y-4 animate-pulse">
                                <div className="bg-muted w-16 h-16 rounded-full mx-auto" />
                                <p className="text-muted-foreground font-medium italic text-sm sm:text-base">Đang tải hàng đợi...</p>
                            </div>
                        ) : status === 'load-error' ? (
                            <div className="py-8 sm:py-12 space-y-4">
                                <div className="bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                    <AlertCircle className="w-8 h-8 text-destructive" />
                                </div>
                                <p className="text-destructive font-medium text-sm sm:text-base">Không thể tải hàng đợi.</p>
                                {loadError && (
                                    <p className="text-muted-foreground text-xs sm:text-sm">{loadError}</p>
                                )}
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={() => connectSSE(serviceId)}
                                    className="mt-4 font-bold"
                                >
                                    <RotateCcw className="mr-2 w-5 h-5" /> Thử lại
                                </Button>
                            </div>
                        ) : currentTicket ? (
                            <div className="space-y-5 sm:space-y-6">
                                <div>
                                    <h2 className="text-6xl sm:text-7xl font-black text-primary tracking-tighter">
                                        {currentTicket.ticketNumber}
                                    </h2>
                                    <p className="text-muted-foreground mt-2 uppercase tracking-widest text-xs sm:text-sm">
                                        {currentTicket.customerName || 'Khách hàng vãng lai'}
                                    </p>
                                </div>

                                <div className="flex flex-wrap justify-center gap-3 sm:gap-4 pt-4">
                                    <Button
                                        size="lg"
                                        variant="default"
                                        className="px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg font-bold"
                                        onClick={complete}
                                        disabled={isLoading}
                                    >
                                        <CheckCircle className="mr-2 w-5 h-5" /> Hoàn thành
                                    </Button>
                                    <Button
                                        size="lg"
                                        variant="outline"
                                        className="px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg font-bold"
                                        onClick={recall}
                                        disabled={isLoading}
                                    >
                                        <Volume2 className="mr-2 w-5 h-5" /> Gọi lại
                                    </Button>
                                    <Button
                                        size="lg"
                                        variant="outline"
                                        className="px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
                                        onClick={skip}
                                        disabled={isLoading}
                                    >
                                        <XCircle className="mr-2 w-5 h-5" /> Bỏ qua
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 sm:py-12 space-y-4">
                                <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                    <Users className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <p className="text-muted-foreground font-medium italic text-sm sm:text-base">Hiện chưa có số nào đang được phục vụ tại quầy.</p>
                                <Button
                                    size="lg"
                                    onClick={callNext}
                                    disabled={isCallNextDisabled(isLoading, pendingTickets.length)}
                                    className="mt-4 font-bold h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg"
                                >
                                    <UserPlus className="mr-2 w-5 h-5" /> Gọi số tiếp theo
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-md">
                    <CardHeader className="py-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="w-4 h-4" /> Hàng đợi chờ xử lý ({pendingTickets.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-64 border-t">
                            <div className="divide-y">
                                {pendingTickets.map((t) => (
                                    <div key={t.id} className="p-4 flex justify-between items-center hover:bg-muted/50 transition-colors">
                                        <span className="font-bold text-lg">{t.ticketNumber}</span>
                                        <Badge variant="outline">Vị trí: {t.position}</Badge>
                                    </div>
                                ))}
                                {pendingTickets.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground italic">Trống</div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            <Card className="flex flex-col shadow-md border-orange-100">
                <CardHeader className="bg-orange-50/50 py-4">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                        <History className="w-4 h-4" /> Danh sách nhỡ ({missedTickets.length})
                    </CardTitle>
                </CardHeader>
                <ScrollArea className="flex-1 border-t">
                    <div className="divide-y">
                        {missedTickets.map((t) => (
                            <div key={t.id} className="p-4 flex flex-col gap-2 hover:bg-orange-50/30 transition-colors">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-lg">{t.ticketNumber}</span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                                        onClick={() => restore(t.id)}
                                        disabled={isLoading}
                                    >
                                        <RotateCcw className="w-4 h-4 mr-1" /> Khôi phục
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Nhỡ {t.missCount} lần
                                </div>
                            </div>
                        ))}
                        {missedTickets.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground italic">Không có vé nhỡ</div>
                        )}
                    </div>
                </ScrollArea>
            </Card>
        </div>
    );
}
