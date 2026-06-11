"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Service } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSpeech } from '@/hooks/useSpeech';
import {
    Clock,
    UserCheck,
    MonitorPlay,
    AlertTriangle,
    Bell,
    BellRing,
    ExternalLink,
    Volume2,
    VolumeX,
    CheckCircle2,
    Wifi,
    Search,
    List,
} from 'lucide-react';

interface WaitingTrackerProps {
    initialTicket: Ticket & { service: Service };
}

type ProximityLevel = 0 | 1 | 2 | 3;

function getStatusLabel(status: TicketStatus) {
    switch (status) {
        case TicketStatus.PENDING:
            return 'Đang chờ';
        case TicketStatus.CALLED:
            return 'Đến lượt';
        case TicketStatus.IN_PROGRESS:
            return 'Đang phục vụ';
        case TicketStatus.COMPLETED:
            return 'Hoàn tất';
        case TicketStatus.MISSED:
            return 'Nhỡ lượt';
        default:
            return status;
    }
}

export default function WaitingTracker({ initialTicket }: WaitingTrackerProps) {
    const router = useRouter();
    const [ticket, setTicket] = useState<Ticket & { service: Service }>(initialTicket);
    const [allTickets, setAllTickets] = useState<(Ticket & { service: Service })[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [lastSpokenLevel, setLastSpokenLevel] = useState<ProximityLevel>(0);
    const { speak, isAudioUnlocked, unlockAudio } = useSpeech();

    useEffect(() => {
        const eventSource = new EventSource(`/api/sse/queue?serviceId=${ticket.serviceId}`);

        eventSource.onopen = () => setIsConnected(true);
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    setAllTickets(data.tickets);

                    const updatedTicket = data.tickets.find((t: Ticket) => t.id === ticket.id);
                    if (updatedTicket) {
                        setTicket((prev) => ({ ...updatedTicket, service: prev.service }));
                    }
                }
            } catch (error) {
                console.error('Error parsing SSE message:', error);
            }
        };
        eventSource.onerror = () => setIsConnected(false);

        return () => eventSource.close();
    }, [ticket.id, ticket.serviceId]);

    const queueAhead = useMemo(() => {
        if (ticket.status !== 'PENDING') return 0;
        return allTickets.filter((t) => t.status === 'PENDING' && t.position < ticket.position).length;
    }, [allTickets, ticket.position, ticket.status]);

    const proximityLevel = useMemo<ProximityLevel>(() => {
        if (ticket.status !== 'PENDING') return 0;
        if (queueAhead <= 1) return 3;
        if (queueAhead <= 2) return 2;
        if (queueAhead <= 3) return 1;
        return 0;
    }, [queueAhead, ticket.status]);

    useEffect(() => {
        if (proximityLevel > 0 && proximityLevel !== lastSpokenLevel && soundEnabled && ticket.status === 'PENDING') {
            const message =
                proximityLevel === 3
                    ? `Số ${ticket.ticketNumber} sắp đến lượt. Xin mời quý khách chuẩn bị.`
                    : proximityLevel === 2
                        ? `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 2 lượt nữa.`
                        : `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 3 lượt nữa.`;
            speak(message);
            setLastSpokenLevel(proximityLevel);
        }

        if (proximityLevel === 0 && lastSpokenLevel > 0) {
            setLastSpokenLevel(0);
        }
    }, [proximityLevel, lastSpokenLevel, soundEnabled, ticket.ticketNumber, ticket.status, speak]);

    const currentServed = useMemo(() => {
        return allTickets.find(
            (t) => t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS
        );
    }, [allTickets]);

    const handleToggleSound = useCallback(() => {
        const newEnabled = !soundEnabled;
        setSoundEnabled(newEnabled);
        if (newEnabled) unlockAudio();
    }, [soundEnabled, unlockAudio]);

    const status = useMemo(() => {
        switch (ticket.status) {
            case 'PENDING':
                return {
                    label:
                        proximityLevel >= 3
                            ? 'Sắp đến lượt'
                            : proximityLevel >= 1
                                ? 'Đang chờ'
                                : 'Đã nhận số',
                    icon:
                        proximityLevel >= 3 ? (
                            <BellRing className="h-4 w-4" />
                        ) : proximityLevel >= 1 ? (
                            <Bell className="h-4 w-4" />
                        ) : (
                            <Clock className="h-4 w-4" />
                        ),
                    tone:
                        proximityLevel >= 3
                            ? 'bg-rose-600 text-white'
                            : proximityLevel >= 2
                                ? 'bg-amber-600 text-white'
                                : proximityLevel >= 1
                                    ? 'bg-yellow-600 text-white'
                                    : 'bg-slate-900 text-white',
                    border: proximityLevel >= 3 ? 'border-rose-200' : 'border-slate-200',
                };
            case 'CALLED':
                return {
                    label: 'Đến lượt',
                    icon: <MonitorPlay className="h-4 w-4" />,
                    tone: 'bg-amber-600 text-white',
                    border: 'border-amber-200',
                };
            case 'IN_PROGRESS':
                return {
                    label: 'Đang phục vụ',
                    icon: <UserCheck className="h-4 w-4" />,
                    tone: 'bg-blue-600 text-white',
                    border: 'border-blue-200',
                };
            case 'COMPLETED':
                return {
                    label: 'Hoàn tất',
                    icon: <CheckCircle2 className="h-4 w-4" />,
                    tone: 'bg-emerald-600 text-white',
                    border: 'border-emerald-200',
                };
            default:
                return {
                    label: ticket.status,
                    icon: <AlertTriangle className="h-4 w-4" />,
                    tone: 'bg-slate-600 text-white',
                    border: 'border-slate-200',
                };
        }
    }, [ticket.status, proximityLevel]);

    const queueText =
        ticket.status === 'PENDING'
            ? queueAhead > 0
                ? `Còn ${queueAhead} lượt nữa`
                : 'Bạn là người tiếp theo'
            : ticket.status === 'CALLED'
                ? `Mời đến ${ticket.pos || 'quầy phục vụ'}`
                : ticket.status === 'IN_PROGRESS'
                    ? `Đang phục vụ tại ${ticket.pos || 'quầy'}`
                    : ticket.status === 'COMPLETED'
                        ? 'Cảm ơn bạn đã sử dụng dịch vụ'
                        : 'Đang cập nhật trạng thái';

    const serviceQueueTickets = useMemo(() => {
        return allTickets
            .filter((t) => t.status === TicketStatus.PENDING || t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS)
            .sort((a, b) => a.position - b.position);
    }, [allTickets]);

    return (
        <div className="mx-auto w-full max-w-xl px-4 py-6">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
                        style={{ backgroundColor: ticket.service.color }}
                    >
                        <span className="text-base font-bold">{ticket.service.prefix}</span>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{ticket.service.name}</p>
                        <p className="text-xs text-slate-500">Theo dõi realtime</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleToggleSound}
                        className={`rounded-full border px-3 py-2 text-sm transition ${
                            soundEnabled
                                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                        title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
                    >
                        <span className="inline-flex items-center gap-2">
                            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                            <span className="hidden sm:inline">Âm thanh</span>
                        </span>
                    </button>

                    <div
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                            isConnected
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                    >
                        {isConnected ? <Wifi className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        <span className="hidden sm:inline">{isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
                    </div>
                </div>
            </div>

            {!isAudioUnlocked && soundEnabled && (
                <button
                    type="button"
                    onClick={unlockAudio}
                    className="mb-4 w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:bg-amber-100"
                >
                    <p className="text-sm font-semibold text-amber-900">Chạm để bật âm thanh</p>
                    <p className="mt-1 text-sm text-amber-700">Hệ thống sẽ tự đọc khi gần đến lượt.</p>
                </button>
            )}

            <Card className={`overflow-hidden border shadow-sm ${status.border}`}>
                <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>
                                {status.icon}
                                {status.label}
                            </span>
                            <p className="mt-3 text-sm text-slate-500">Số của bạn</p>
                            <div className="mt-1 text-5xl font-black tracking-tight text-slate-950">
                                {ticket.ticketNumber}
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{queueText}</p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Phía trước</p>
                            <p className="mt-1 text-2xl font-black text-slate-900">
                                {ticket.status === 'PENDING' ? queueAhead : 0}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-medium text-slate-500">Đang phục vụ</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                        {currentServed ? currentServed.ticketNumber : '—'}
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-medium text-slate-500">Quầy</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                        {currentServed?.pos || '—'}
                    </p>
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Trạng thái hiện tại</p>
                <p className="mt-1 text-sm text-slate-600">{queueText}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button
                    variant="outline"
                    className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
                    onClick={() => router.push('/track')}
                >
                    <Search className="mr-2 h-4 w-4" />
                    Tra cứu vé khác
                </Button>

                <Button
                    variant="outline"
                    className="rounded-2xl border-slate-300 bg-white py-6 text-base font-semibold text-slate-900 shadow-sm"
                    onClick={() =>
                        document.getElementById('service-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                >
                    <List className="mr-2 h-4 w-4" />
                    Xem danh sách quầy
                </Button>
            </div>

            <div id="service-queue" className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">Danh sách hàng chờ của quầy</p>
                    <p className="mt-1 text-xs text-slate-500">
                        Chỉ hiển thị các số đang chờ, đang gọi và đang phục vụ của dịch vụ này.
                    </p>
                </div>

                <div className="divide-y">
                    {serviceQueueTickets.length > 0 ? (
                        serviceQueueTickets.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div>
                                    <p className="text-base font-semibold text-slate-900">{item.ticketNumber}</p>
                                    <p className="text-xs text-slate-500">
                                        {getStatusLabel(item.status as TicketStatus)} · Vị trí {item.position}
                                    </p>
                                </div>
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                        item.status === TicketStatus.CALLED
                                            ? 'bg-amber-100 text-amber-800'
                                            : item.status === TicketStatus.IN_PROGRESS
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    {getStatusLabel(item.status as TicketStatus)}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                            Chưa có ai trong hàng chờ của quầy này.
                        </div>
                    )}
                </div>
            </div>

            <Button
                variant="ghost"
                className="mt-4 w-full rounded-2xl py-6 text-sm font-medium text-slate-600"
                onClick={() => router.push('/track')}
            >
                <ExternalLink className="mr-2 h-4 w-4" />
                Mở trang tra cứu riêng
            </Button>
        </div>
    );
}