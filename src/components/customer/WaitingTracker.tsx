"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Ticket, Service } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSpeech } from '@/hooks/useSpeech';
import {
    Clock,
    UserCheck,
    MonitorPlay,
    AlertTriangle,
    ChevronRight,
    Bell,
    BellRing,
    ExternalLink,
    Volume2,
    VolumeX,
} from 'lucide-react';

interface WaitingTrackerProps {
    initialTicket: Ticket & { service: Service };
}

const PROXIMITY_THRESHOLDS = [3, 2, 1] as const;
type ProximityLevel = 0 | 1 | 2 | 3;

/**
 * WaitingTracker Component
 * Giao diện chờ sau khi lấy số: hiển thị số của người dùng, vị trí, countdown,
 * và đặc biệt khi còn 3, 2, 1 lượt thì giao diện thay đổi + TTS.
 */
export default function WaitingTracker({ initialTicket }: WaitingTrackerProps) {
    const [ticket, setTicket] = useState<Ticket & { service: Service }>(initialTicket);
    const [allTickets, setAllTickets] = useState<(Ticket & { service: Service })[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [lastSpokenLevel, setLastSpokenLevel] = useState<ProximityLevel>(0);
    const { speak, isAudioUnlocked, unlockAudio } = useSpeech();

    // Connect to SSE for real-time updates
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

    // Tính toán số người đang chờ trước mình
    const { peopleAhead, proximityLevel } = useMemo(() => {
        if (ticket.status !== 'PENDING') {
            return { peopleAhead: 0, proximityLevel: 0 as ProximityLevel };
        }

        const ahead = allTickets.filter(
            (t) => t.status === 'PENDING' && t.position < ticket.position
        ).length;

        // Xác định proximity level (0 = xa, 1 = còn 3, 2 = còn 2, 3 = còn 1)
        let level: ProximityLevel = 0;
        if (ahead <= 1) level = 3;
        else if (ahead <= 2) level = 2;
        else if (ahead <= 3) level = 1;

        return { peopleAhead: ahead, proximityLevel: level };
    }, [allTickets, ticket.status, ticket.position]);

    // TTS khi proximity thay đổi
    useEffect(() => {
        if (proximityLevel > 0 && proximityLevel !== lastSpokenLevel && soundEnabled && ticket.status === 'PENDING') {
            const message =
                proximityLevel === 3
                    ? `Số ${ticket.ticketNumber} sắp đến lượt! Xin mời quý khách chuẩn bị.`
                    : proximityLevel === 2
                        ? `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 2 lượt nữa.`
                        : `Số ${ticket.ticketNumber} sắp đến lượt, chỉ còn 3 lượt nữa.`;
            speak(message);
            setLastSpokenLevel(proximityLevel);
        }
        // Reset khi ra khỏi vùng proximity
        if (proximityLevel === 0 && lastSpokenLevel > 0) {
            setLastSpokenLevel(0);
        }
    }, [proximityLevel, lastSpokenLevel, soundEnabled, ticket.ticketNumber, ticket.status, speak]);

    // Tìm ticket đang được phục vụ tại quầy (cùng dịch vụ)
    const currentServed = useMemo(() => {
        return allTickets.find(
            (t) =>
                t.status === TicketStatus.CALLED ||
                t.status === TicketStatus.IN_PROGRESS
        );
    }, [allTickets]);

    // Tính màu sắc và giao diện dựa trên proximity
    const proximityStyle = useMemo(() => {
        if (ticket.status !== 'PENDING') return { bg: 'bg-gradient-to-br from-blue-50 to-white', border: 'border-blue-200', badge: 'default', textColor: 'text-primary' };

        switch (proximityLevel) {
            case 3:
                return { bg: 'bg-gradient-to-br from-red-50 to-red-100 animate-pulse', border: 'border-red-400', badge: 'destructive', textColor: 'text-red-600' };
            case 2:
                return { bg: 'bg-gradient-to-br from-orange-50 to-orange-100', border: 'border-orange-400', badge: 'warning', textColor: 'text-orange-600' };
            case 1:
                return { bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100', border: 'border-yellow-400', badge: 'secondary', textColor: 'text-yellow-600' };
            default:
                return { bg: 'bg-gradient-to-br from-blue-50 to-white', border: 'border-blue-200', badge: 'default', textColor: 'text-primary' };
        }
    }, [proximityLevel, ticket.status]);

    // Trạng thái badge
    const statusBadge = useMemo(() => {
        switch (ticket.status) {
            case 'PENDING':
                return {
                    color: proximityLevel >= 3 ? 'bg-red-500 text-white' :
                        proximityLevel >= 2 ? 'bg-orange-500 text-white' :
                            proximityLevel >= 1 ? 'bg-yellow-500 text-white' :
                                'bg-blue-500 text-white',
                    icon: proximityLevel >= 3 ? <BellRing className="w-4 h-4" /> :
                        proximityLevel >= 1 ? <Bell className="w-4 h-4" /> :
                            <Clock className="w-4 h-4" />,
                    label: proximityLevel >= 3 ? 'SẮP ĐẾN LƯỢT!' :
                        proximityLevel >= 1 ? 'Sắp đến lượt' :
                            'Đang chờ',
                };
            case 'CALLED':
                return {
                    color: 'bg-yellow-500 text-white animate-pulse',
                    icon: <MonitorPlay className="w-4 h-4" />,
                    label: 'ĐẾN LƯỢT!',
                };
            case 'IN_PROGRESS':
                return {
                    color: 'bg-blue-500 text-white',
                    icon: <UserCheck className="w-4 h-4" />,
                    label: 'Đang xử lý',
                };
            case 'COMPLETED':
                return {
                    color: 'bg-green-500 text-white',
                    icon: <UserCheck className="w-4 h-4" />,
                    label: 'Hoàn tất',
                };
            default:
                return {
                    color: 'bg-gray-500 text-white',
                    icon: <AlertTriangle className="w-4 h-4" />,
                    label: ticket.status,
                };
        }
    }, [ticket.status, proximityLevel]);

    // Handle sound toggle
    const handleToggleSound = useCallback(() => {
        const newEnabled = !soundEnabled;
        setSoundEnabled(newEnabled);
        if (newEnabled) {
            unlockAudio();
        }
    }, [soundEnabled, unlockAudio]);

    return (
        <div className="w-full max-w-md mx-auto space-y-4 px-4 py-6">
            {/* Header: Service name + connection status + sound toggle */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: ticket.service.color }}
                    >
                        {ticket.service.prefix}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">{ticket.service.name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleToggleSound}
                        className={`p-1.5 rounded-full transition-colors ${soundEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                        title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
                    >
                        {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                    <div
                        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                        title={isConnected ? 'Đã kết nối' : 'Mất kết nối'}
                    />
                </div>
            </div>

            {/* Audio unlock prompt (nếu user chưa click để kích hoạt âm thanh) */}
            {!isAudioUnlocked && soundEnabled && (
                <div
                    className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center cursor-pointer hover:bg-yellow-100 transition-colors"
                    onClick={unlockAudio}
                >
                    <p className="text-sm font-medium text-yellow-800">
                        🔇 Chạm để kích hoạt âm thanh thông báo
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                        Nhấn vào đây để nhận thông báo bằng giọng nói khi đến lượt
                    </p>
                </div>
            )}

            {/* Main ticket card */}
            <Card className={`border-2 transition-all duration-500 ${proximityStyle.bg} ${proximityStyle.border} shadow-lg`}>
                <CardContent className="p-6 space-y-4">
                    {/* Ticket number - large */}
                    <div className="text-center">
                        <div className={`text-6xl font-black tracking-tighter ${proximityStyle.textColor} transition-colors duration-500`}>
                            {ticket.ticketNumber}
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${statusBadge.color}`}>
                                {statusBadge.icon}
                                {statusBadge.label}
                            </span>
                        </div>
                    </div>

                    {/* PENDING: Show position info */}
                    {ticket.status === 'PENDING' && (
                        <>
                            <div className="text-center space-y-1">
                                <p className="text-sm text-muted-foreground">Vị trí hiện tại</p>
                                <p className={`text-2xl font-bold ${proximityStyle.textColor}`}>
                                    {peopleAhead > 0 ? `Còn ${peopleAhead} lượt nữa` : 'Bạn là người tiếp theo!'}
                                </p>
                            </div>

                            {/* Đang phục vụ tại quầy của người dùng */}
                            {currentServed && (
                                <div className="bg-white/60 rounded-lg p-3 border border-blue-100">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Đang phục vụ:
                                        </span>
                                        <span className="font-bold text-primary">
                                            {currentServed.ticketNumber} {currentServed.pos ? `(${currentServed.pos})` : ''}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Proximity alert overlay */}
                            {proximityLevel >= 2 && (
                                <div className={`rounded-lg p-3 text-center font-bold text-sm animate-bounce ${proximityLevel >= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {proximityLevel >= 3
                                        ? '🔔 Sắp đến lượt bạn! Xin mời chuẩn bị!'
                                        : '⏰ Sắp đến lượt, xin quý khách chú ý!'}
                                </div>
                            )}
                        </>
                    )}

                    {/* CALLED: Show counter info */}
                    {ticket.status === 'CALLED' && (
                        <div className="text-center space-y-2">
                            <p className="text-lg font-bold text-yellow-700">Vui lòng đến quầy</p>
                            <p className="text-3xl font-black text-yellow-800">{ticket.pos || 'Quầy phục vụ'}</p>
                        </div>
                    )}

                    {/* COMPLETED */}
                    {ticket.status === 'COMPLETED' && (
                        <div className="text-center">
                            <p className="text-green-700 font-medium">Cảm ơn bạn đã sử dụng dịch vụ!</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action: Go to detailed tracking */}
            <div className="text-center">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => window.location.href = `/track?ticketId=${ticket.id}`}
                >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Xem chi tiết dòng số
                    <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
            </div>

        </div>
    );
}