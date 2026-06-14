"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Volume2, SmartphoneNfc, Hand, User } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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

export default function DisplayBoard() {
    const [currentCalls, setCurrentCalls] = useState<Record<string, CurrentCall>>({});
    const [counters, setCounters] = useState<string[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speakAnnouncement, speakPrepare, isAudioUnlocked, unlockAudio } = useSpeech();
    const isProcessedRef = useRef(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [settingsData, tickets] = await Promise.all([
                    apiClient.get<{ value: string }>('/api/settings?key=counters').catch(() => ({ value: '' })),
                    apiClient.get<Ticket[]>('/api/tickets').catch(() => [] as Ticket[]),
                ]);

                const counterList = settingsData.value
                    ? settingsData.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [];

                const activeCounterSet = new Set<string>();
                const calls: Record<string, CurrentCall> = {};

                for (const t of tickets) {
                    if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                        activeCounterSet.add(t.pos);
                        calls[t.pos] = {
                            ticketNumber: t.ticketNumber,
                            pos: t.pos,
                            customerName: (t as Ticket & { customerName?: string | null }).customerName,
                            timestamp: Date.now(),
                        };
                    }
                }

                const allCounters = counterList.length > 0
                    ? [...new Set([...counterList, ...activeCounterSet])]
                    : [...activeCounterSet];

                setCounters(allCounters.length > 0 ? allCounters : ['Quầy số 1', 'Quầy số 2', 'Quầy số 3', 'Quầy số 4']);
                setCurrentCalls(calls);
            } catch (error) {
                logger.error('Error fetching initial data for display:', error);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        audioRef.current = new Audio('/sounds/chime.mp3');
        audioRef.current.load();

        const displayEventSource = new EventSource('/api/sse/display');
        displayEventSource.onopen = () => setIsConnected(true);
        displayEventSource.onmessage = (event) => {
            try {
                const data: DisplayCallEvent = JSON.parse(event.data);
                if (data.type === 'DISPLAY_CALL') {
                    const newCall: CurrentCall = { ticketNumber: data.ticketNumber, pos: data.pos, customerName: data.customerName, timestamp: Date.now() };
                    setCurrentCalls(prev => ({ ...prev, [data.pos]: newCall }));
                    setLastCalledTicket(newCall);

                    setCounters(prev => prev.includes(data.pos) ? prev : [...prev, data.pos].sort());

                    audioRef.current?.play().catch(() => {});

                    speakAnnouncement(data.ticketNumber, data.pos);

                    if (data.nextTicketNumber) {
                        speakPrepare(data.nextTicketNumber);
                    }

                    setTimeout(() => setLastCalledTicket(null), 5000);
                }
            } catch (error) {
                logger.error('Error parsing display SSE message:', error);
            }
        };
        displayEventSource.onerror = () => setIsConnected(false);

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
                    setCurrentCalls(activeCalls);

                    const activePositions = Object.keys(activeCalls);
                    if (activePositions.length > 0) {
                        setCounters(prev => [...new Set([...prev, ...activePositions])].sort());
                    }
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
    }, [speakAnnouncement, speakPrepare]);

    const handleUserInteraction = () => {
        if (!isProcessedRef.current) {
            isProcessedRef.current = true;
            unlockAudio();
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
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

            <header className="py-6 text-center relative">
                <h1 className="text-5xl font-extrabold" style={{ color: '#00BD7D' }}>
                    BẢNG GỌI SỐ
                </h1>
            </header>

            <main className="flex-1 px-6 pb-6">
                {counterDisplayList.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-2xl text-muted-foreground/50 italic">
                            Đang chờ dữ liệu...
                        </p>
                    </div>
                ) : (
                    <div className="h-full grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {counterDisplayList.map(({ pos, call, isActive, isHighlighted }) => (
                            <Card
                                key={pos}
                                className={`border-2 transition-all duration-500 flex flex-col justify-center items-center p-6
                                    ${isHighlighted
                                        ? 'border-yellow-400 bg-yellow-50 shadow-lg shadow-yellow-500/30 animate-pulse-once'
                                        : isActive
                                            ? 'border-emerald-400 bg-white shadow-md'
                                            : 'border-dashed border-slate-300 bg-slate-50/50'
                                    }
                                `}
                            >
                                <CardTitle className="text-3xl font-bold text-slate-500 mb-3">
                                    {pos}
                                </CardTitle>
                                <CardContent className="p-0 flex flex-col items-center gap-2">
                                    {isActive && call ? (
                                        <>
                                            <p className="text-7xl font-black tracking-tighter" style={{ color: '#00BD7D' }}>
                                                {call.ticketNumber}
                                            </p>
                                            {call.customerName && (
                                                <p className="text-xl text-slate-500 font-medium flex items-center gap-2">
                                                    <User className="w-5 h-5" />
                                                    {call.customerName}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-xl text-slate-400 italic flex items-center gap-2">
                                            <SmartphoneNfc className="w-5 h-5" />
                                            Chưa có số
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            <footer className="px-6 py-3 border-t border-slate-200 text-slate-500 text-sm flex justify-between items-center">
                <span>
                    Trạng thái kết nối:
                    <span className={`ml-2 font-semibold ${isConnected ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isConnected ? 'Đã kết nối' : 'Mất kết nối'}
                    </span>
                </span>
                <div className="flex items-center gap-2">
                    {!isAudioUnlocked && (
                        <span className="text-amber-500 text-xs">
                            Âm thanh chưa kích hoạt
                        </span>
                    )}
                    <Volume2 className={`w-5 h-5 ${!isAudioUnlocked ? 'text-amber-500' : 'text-slate-400'}`} />
                </div>
            </footer>
        </div>
    );
}