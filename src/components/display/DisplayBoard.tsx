"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Card, CardTitle } from '@/components/ui/card';
import { User, Users } from 'lucide-react';
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
    const [allTickets, setAllTickets] = useState<Ticket[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [previousCalls, setPreviousCalls] = useState<Record<string, { serviceId: string; lostAt: number }>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [time, setTime] = useState(new Date());

    const PREVIOUS_CALL_TTL = 60000;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speakAnnouncement, speakPrepare, unlockAudio } = useSpeech();

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
                setAllTickets(tickets);
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
                    const ticketServiceMap: Record<string, string> = {};

                    for (const t of data.tickets) {
                        ticketServiceMap[t.ticketNumber] = t.serviceId;
                        if ((t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS) && t.pos) {
                            activeCalls[t.pos] = { ticketNumber: t.ticketNumber, pos: t.pos, customerName: (t as Ticket & { customerName?: string | null }).customerName, timestamp: Date.now() };
                        }
                    }

                    setCurrentCalls(prev => {
                        const lostCounters: Record<string, { serviceId: string; lostAt: number }> = {};
                        for (const pos of Object.keys(prev)) {
                            if (!activeCalls[pos]) {
                                const lostTicket = prev[pos].ticketNumber;
                                const serviceId = ticketServiceMap[lostTicket];
                                if (serviceId) {
                                    lostCounters[pos] = { serviceId, lostAt: Date.now() };
                                }
                            }
                        }
                        if (Object.keys(lostCounters).length > 0) {
                            setPreviousCalls(p => {
                                const now = Date.now();
                                const merged = { ...p, ...lostCounters };
                                const fresh: Record<string, { serviceId: string; lostAt: number }> = {};
                                for (const [pos, info] of Object.entries(merged)) {
                                    if (now - info.lostAt < PREVIOUS_CALL_TTL) {
                                        fresh[pos] = info;
                                    }
                                }
                                return fresh;
                            });
                        }
                        return activeCalls;
                    });
                    setAllTickets(data.tickets);

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

    useEffect(() => {
        unlockAudio();
    }, [unlockAudio]);

    const pendingByServiceId = useMemo(() => {
        const map: Record<string, number> = {};
        for (const t of allTickets) {
            if (t.status === TicketStatus.PENDING) {
                map[t.serviceId] = (map[t.serviceId] || 0) + 1;
            }
        }
        return map;
    }, [allTickets]);

    const ticketServiceMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const t of allTickets) {
            map[t.ticketNumber] = t.serviceId;
        }
        return map;
    }, [allTickets]);

    const counterDisplayList = useMemo(() => {
        return counters.map(counter => {
            const call = currentCalls[counter];
            const prevInfo = previousCalls[counter];
            const serviceId = call
                ? ticketServiceMap[call.ticketNumber]
                : prevInfo?.serviceId;
            const waitingCount = serviceId ? pendingByServiceId[serviceId] ?? 0 : 0;
            return {
                pos: counter,
                call,
                isActive: !!call,
                isBetweenCalls: !call && !!prevInfo,
                waitingCount,
                isHighlighted: lastCalledTicket?.pos === counter &&
                    lastCalledTicket?.ticketNumber === call?.ticketNumber,
            };
        }).sort((a, b) => a.pos.localeCompare(b.pos));
    }, [counters, currentCalls, lastCalledTicket, pendingByServiceId, ticketServiceMap, previousCalls]);

    const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div
            className="relative flex flex-col h-screen w-screen bg-white text-foreground font-sans overflow-hidden"
        >
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
                    <span className="text-lg font-semibold text-slate-700">{timeStr}</span>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-5 p-6 content-start auto-rows-max">
                {counterDisplayList.map(({ pos, call, isActive, isHighlighted, isBetweenCalls, waitingCount }) => (
                    <Card
                        key={pos}
                        className={`border-2 transition-all duration-500 flex flex-col justify-center items-center py-7 px-4
                            ${isHighlighted
                                ? 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-500/20'
                                : isActive
                                    ? 'border-emerald-300 bg-white shadow-sm'
                                    : isBetweenCalls
                                        ? 'border-emerald-200 bg-emerald-50/50 border-dashed'
                                        : 'border-dashed border-slate-200 bg-slate-50'
                            }
                        `}
                    >
                        <CardTitle className="text-lg font-bold text-slate-400 mb-1 tracking-wide">
                            {pos}
                        </CardTitle>
                        {isActive && call ? (
                            <>
                                <p className="text-6xl font-black tracking-tighter leading-none my-3" style={{ color: '#00BD7D' }}>
                                    {call.ticketNumber}
                                </p>
                                {call.customerName && (
                                    <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5 mb-2">
                                        <User className="w-3.5 h-3.5" />
                                        {call.customerName}
                                    </p>
                                )}
                                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400 mt-2">
                                    <Users className="w-4 h-4" />
                                    <span>{waitingCount} lượt chờ</span>
                                </div>
                            </>
                        ) : isBetweenCalls ? (
                            <>
                                <p className="text-3xl font-bold tracking-tighter leading-none my-3 text-slate-300">
                                    ...
                                </p>
                                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400">
                                    <Users className="w-4 h-4" />
                                    <span>{waitingCount} lượt chờ</span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1">Đang gọi tiếp...</p>
                            </>
                        ) : (
                            <p className="text-base text-slate-300 font-medium my-8">
                                Đang rảnh
                            </p>
                        )}
                    </Card>
                ))}
            </main>
        </div>
    );
}
