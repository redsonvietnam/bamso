"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Volume2, Hand, User, ArrowRight } from 'lucide-react';
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
    const [pendingTickets, setPendingTickets] = useState<Ticket[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [time, setTime] = useState(new Date());

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speakAnnouncement, speakPrepare, isAudioUnlocked, unlockAudio } = useSpeech();
    const isProcessedRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

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
                const pending: Ticket[] = [];

                for (const t of tickets) {
                    if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                        activeCounterSet.add(t.pos);
                        calls[t.pos] = {
                            ticketNumber: t.ticketNumber,
                            pos: t.pos,
                            customerName: (t as Ticket & { customerName?: string | null }).customerName,
                            timestamp: Date.now(),
                        };
                    } else if (t.status === TicketStatus.PENDING) {
                        pending.push(t);
                    }
                }

                const allCounters = counterList.length > 0
                    ? [...new Set([...counterList, ...activeCounterSet])]
                    : [...activeCounterSet];

                setCounters(allCounters.length > 0 ? allCounters : ['Quầy số 1', 'Quầy số 2', 'Quầy số 3', 'Quầy số 4']);
                setCurrentCalls(calls);
                setPendingTickets(pending.sort((a, b) => a.position - b.position));
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
                    const pending: Ticket[] = [];

                    for (const t of data.tickets) {
                        if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                            activeCalls[t.pos] = { ticketNumber: t.ticketNumber, pos: t.pos, customerName: (t as Ticket & { customerName?: string | null }).customerName, timestamp: Date.now() };
                        } else if (t.status === TicketStatus.PENDING) {
                            pending.push(t);
                        }
                    }

                    setCurrentCalls(activeCalls);
                    setPendingTickets(pending.sort((a, b) => a.position - b.position));

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

    const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div
            className="relative flex flex-col h-screen w-screen bg-white text-foreground font-sans overflow-hidden"
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

            <header className="flex items-center justify-between px-8 py-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#00BD7D' }}>
                        BẢNG GỌI SỐ
                    </h1>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        <span>{isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                    {!isAudioUnlocked && (
                        <span className="text-xs text-amber-500 flex items-center gap-1">
                            <Volume2 className="w-3.5 h-3.5" />
                            Chạm để bật âm thanh
                        </span>
                    )}
                    <span className="text-lg font-semibold text-slate-700">{timeStr}</span>
                </div>
            </header>

            <main className="flex-1 flex gap-6 p-6 min-h-0">
                <div className="flex-1 grid grid-cols-2 xl:grid-cols-3 gap-4 content-start">
                    {counterDisplayList.map(({ pos, call, isActive, isHighlighted }) => (
                        <Card
                            key={pos}
                            className={`border-2 transition-all duration-500 flex flex-col justify-center items-center p-5
                                ${isHighlighted
                                    ? 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-500/20'
                                    : isActive
                                        ? 'border-emerald-300 bg-white shadow-sm'
                                        : 'border-dashed border-slate-200 bg-slate-50'
                                }
                            `}
                        >
                            <CardTitle className="text-xl font-bold text-slate-500 mb-2">
                                {pos}
                            </CardTitle>
                            <CardContent className="p-0 flex flex-col items-center gap-1">
                                {isActive && call ? (
                                    <>
                                        <p className="text-6xl font-black tracking-tighter" style={{ color: '#00BD7D' }}>
                                            {call.ticketNumber}
                                        </p>
                                        {call.customerName && (
                                            <p className="text-base text-slate-500 font-medium flex items-center gap-1.5">
                                                <User className="w-4 h-4" />
                                                {call.customerName}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-lg text-slate-300 font-medium">
                                        ——
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <aside className="w-80 shrink-0 flex flex-col">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 flex-1 flex flex-col min-h-0">
                        <div className="px-4 py-3 border-b border-slate-200">
                            <h2 className="text-base font-bold text-slate-700">Hàng chờ</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {pendingTickets.length} người đang chờ
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {pendingTickets.length > 0 ? (
                                pendingTickets.slice(0, 20).map((t, i) => (
                                    <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                                i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {t.position}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-800 truncate">
                                                {t.ticketNumber}
                                            </span>
                                            {(t as Ticket & { customerName?: string | null }).customerName && (
                                                <span className="text-xs text-slate-400 truncate">
                                                    {(t as Ticket & { customerName?: string | null }).customerName}
                                                </span>
                                            )}
                                        </div>
                                        {i === 0 && (
                                            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 shrink-0">
                                                <ArrowRight className="w-3 h-3" />
                                                Tiếp theo
                                            </span>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="flex items-center justify-center h-full text-sm text-slate-300 italic">
                                    Chưa có ai trong hàng chờ
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}
