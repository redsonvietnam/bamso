"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Volume2, SmartphoneNfc, Hand } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

// Define types for the data received from SSE
interface DisplayCallEvent {
    type: 'DISPLAY_CALL';
    ticketNumber: string;
    pos: string;
    customerName?: string | null;
    nextTicketNumber?: string;
}

interface QueueUpdateEvent {
    type: 'QUEUE_UPDATE';
    tickets: Ticket[];
}

interface CurrentCall {
    ticketNumber: string;
    pos: string;
    customerName?: string | null;
    timestamp: number;
}

/**
 * DisplayBoard Component
 * Hiển thị tất cả các quầy trên màn hình lớn. Mỗi quầy hiện số đang được phục vụ
 * hoặc trạng thái rảnh. Người dùng chỉ cần nhìn vào quầy mình cần đến là biết số hiện tại.
 */
export default function DisplayBoard() {
    const [currentCalls, setCurrentCalls] = useState<Record<string, CurrentCall>>({});
    const [counters, setCounters] = useState<string[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speak, speakAnnouncement, speakPrepare, isAudioUnlocked, unlockAudio } = useSpeech();
    const isProcessedRef = useRef(false);

    // Fetch initial data: counters list + active tickets
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch counters from settings
                try {
                    const settingsData = await apiClient.get<{ value: string }>('/api/settings?key=counters');
                    if (settingsData.value) {
                        const counterList = settingsData.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                        setCounters(counterList);
                    }
                } catch {
                    // counters fetch failed silently
                }

                // Fetch all tickets today to get current calls
                let tickets: Ticket[] = [];
                try {
                    tickets = await apiClient.get<Ticket[]>('/api/tickets');
                    const calls: Record<string, CurrentCall> = {};
                    for (const t of tickets) {
                        if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                            calls[t.pos] = { ticketNumber: t.ticketNumber, pos: t.pos, customerName: (t as Ticket & { customerName?: string | null }).customerName, timestamp: Date.now() };
                        }
                    }
                    setCurrentCalls(calls);
                } catch {
                    // tickets fetch failed silently
                }
            } catch (error) {
                logger.error('Error fetching initial data for display:', error);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        audioRef.current = new Audio('/sounds/chime.mp3');
        audioRef.current.load();

        // SSE for Display Calls (hiệu ứng gọi số + âm thanh)
        const displayEventSource = new EventSource('/api/sse/display');
        displayEventSource.onopen = () => setIsConnected(true);
        displayEventSource.onmessage = (event) => {
            try {
                const data: DisplayCallEvent = JSON.parse(event.data);
                if (data.type === 'DISPLAY_CALL') {
                    const newCall: CurrentCall = { ticketNumber: data.ticketNumber, pos: data.pos, customerName: data.customerName, timestamp: Date.now() };
                    setCurrentCalls(prev => ({ ...prev, [data.pos]: newCall }));
                    setLastCalledTicket(newCall);

                    // Play chime sound (will be silent until user unlocks audio)
                    audioRef.current?.play().catch(e => logger.warn("Chime play skipped (may need user interaction):", e));

                    speakAnnouncement(data.ticketNumber, data.pos);

                    if (data.nextTicketNumber) {
                        // Queue sẽ phát tuần tự: câu "chuẩn bị" chỉ phát sau khi câu trên kết thúc
                        speakPrepare(data.nextTicketNumber);
                    }

                    setTimeout(() => setLastCalledTicket(null), 5000);
                }
            } catch (error) {
                logger.error('Error parsing display SSE message:', error);
            }
        };
        displayEventSource.onerror = () => setIsConnected(false);

        // SSE for Queue Updates (đồng bộ trạng thái các quầy khi hoàn thành/bỏ qua)
        const queueEventSource = new EventSource('/api/sse/queue');
        queueEventSource.onopen = () => setIsConnected(true);
        queueEventSource.onmessage = (event) => {
            try {
                const data: QueueUpdateEvent = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    const activeCalls: Record<string, CurrentCall> = {};
                    for (const t of data.tickets) {
                        if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                            activeCalls[t.pos] = { ticketNumber: t.ticketNumber, pos: t.pos, customerName: (t as Ticket & { customerName?: string | null }).customerName, timestamp: Date.now() };
                        }
                    }
                    setCurrentCalls(prev => {
                        if (Object.keys(activeCalls).length === 0) return {};
                        const merged = { ...prev };
                        // Add/update active calls
                        for (const [pos, call] of Object.entries(activeCalls)) {
                            merged[pos] = call;
                        }
                        // Remove counters no longer active
                        for (const pos of Object.keys(prev)) {
                            if (!activeCalls[pos]) delete merged[pos];
                        }
                        return merged;
                    });
                }
            } catch (error) {
                logger.error('Error parsing queue SSE message:', error);
            }
        };
        queueEventSource.onerror = () => setIsConnected(false);

        return () => {
            displayEventSource.close();
            queueEventSource.close();
        };
    }, [speak, speakAnnouncement, speakPrepare]);

    // Handle user interaction to unlock audio
    const handleUserInteraction = () => {
        if (!isProcessedRef.current) {
            isProcessedRef.current = true;
            unlockAudio();

            // Replay chime if audio just got unlocked
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => { });
            }
        }
    };

    const counterDisplayList = useMemo(() => {
        return counters.map(counter => {
            const call = currentCalls[counter];
            return {
                pos: counter,
                call,
                isActive: !!call,
                isHighlighted: lastCalledTicket?.pos === counter &&
                    lastCalledTicket?.ticketNumber === call?.ticketNumber,
            };
        }).sort((a, b) => a.pos.localeCompare(b.pos));
    }, [counters, currentCalls, lastCalledTicket]);

    return (
        <div
            className="relative flex flex-col h-screen w-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-foreground font-sans"
            onClick={!isAudioUnlocked ? handleUserInteraction : undefined}
            onTouchStart={!isAudioUnlocked ? handleUserInteraction : undefined}
        >
            {/* Audio Unlock Overlay */}
            {!isAudioUnlocked && (
                <div
                    className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
                    onClick={handleUserInteraction}
                    onTouchStart={handleUserInteraction}
                >
                    <div className="animate-bounce mb-6">
                        <Hand className="w-20 h-20 text-white" />
                    </div>
                    <p className="text-4xl font-bold text-white mb-4">
                        Chạm vào màn hình
                    </p>
                    <p className="text-2xl text-white/70">
                        để kích hoạt âm thanh thông báo
                    </p>
                    <div className="mt-10 flex items-center gap-3 text-white/50 text-lg">
                        <Volume2 className="w-6 h-6" />
                        <span>Âm thanh sẽ phát sau khi bạn chạm</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="py-6 text-center relative">
                <h1 className="text-6xl font-extrabold text-primary">
                    BẢNG GỌI SỐ
                </h1>
            </header>

            {/* Counters Grid — chiếm toàn bộ không gian còn lại */}
            <main className="flex-1 px-8 pb-8">
                <div className="h-full grid grid-cols-2 lg:grid-cols-3 gap-6">
                    {counterDisplayList.map(({ pos, call, isActive, isHighlighted }) => (
                        <Card
                            key={pos}
                            className={`border-2 transition-all duration-500 flex flex-col justify-center items-center p-8
                                ${isHighlighted
                                    ? 'border-yellow-400 bg-yellow-50 shadow-lg shadow-yellow-500/30 animate-pulse-once'
                                    : isActive
                                        ? 'border-primary/40 bg-card'
                                        : 'border-dashed border-muted-foreground/30 bg-muted/30'
                                }
                            `}
                        >
                            <CardTitle className="text-4xl font-bold text-muted-foreground mb-4">
                                {pos}
                            </CardTitle>
                            <CardContent className="p-0 flex flex-col items-center gap-2">
                                {isActive && call ? (
                                    <>
                                        <p className="text-8xl font-black text-primary tracking-tighter">
                                            {call.ticketNumber}
                                        </p>
                                        {call.customerName && (
                                            <p className="text-2xl text-muted-foreground font-medium">
                                                {call.customerName}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-2xl text-muted-foreground/50 italic flex items-center gap-2">
                                        <SmartphoneNfc className="w-6 h-6" />
                                        Chưa có số
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>

            {/* Footer: connection status + sound */}
            <footer className="px-8 py-3 border-t border-border text-muted-foreground text-sm flex justify-between items-center">
                <span>
                    Trạng thái kết nối:
                    <span className={`ml-2 font-semibold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                        {isConnected ? 'Đã kết nối' : 'Mất kết nối'}
                    </span>
                </span>
                <div className="flex items-center gap-2">
                    {!isAudioUnlocked && (
                        <span className="text-yellow-600 text-xs">
                            Âm thanh chưa kích hoạt
                        </span>
                    )}
                    <Volume2 className={`w-5 h-5 ${!isAudioUnlocked ? 'text-yellow-600' : ''}`} />
                </div>
            </footer>
        </div>
    );
}