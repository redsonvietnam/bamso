"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Users, Bell, Clock, WifiOff } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
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

// Store EventSource instances globally to prevent duplicates during hot-reloading in dev.
declare global {
    var displayBoard_displayEventSource: EventSource | undefined;
    var displayBoard_queueEventSource: EventSource | undefined;
}

export default function DisplayBoard() {
    const [currentCalls, setCurrentCalls] = useState<Record<string, CurrentCall>>({});
    const [counters, setCounters] = useState<string[]>([]);
    const [allTickets, setAllTickets] = useState<Ticket[]>([]);
    const [lastCalledTicket, setLastCalledTicket] = useState<CurrentCall | null>(null);
    const [previousCalls, setPreviousCalls] = useState<Record<string, { serviceId: string; lostAt: number }>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [time, setTime] = useState(new Date());
    const reduceMotion = useReducedMotion();

    const PREVIOUS_CALL_TTL = 60000;
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { speakAnnouncement, speakPrepare } = useSpeech();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
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
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        audioRef.current = new Audio('/sounds/chime.mp3');
        audioRef.current.load();

        if (global.displayBoard_displayEventSource) global.displayBoard_displayEventSource.close();
        global.displayBoard_displayEventSource = new EventSource('/api/sse/display');
        global.displayBoard_displayEventSource.onopen = () => setIsConnected(true);
        global.displayBoard_displayEventSource.onmessage = (event) => {
            try {
                const data: DisplayCallEvent = JSON.parse(event.data);
                if (data.type === 'DISPLAY_CALL') {
                    const newCall: CurrentCall = { ticketNumber: data.ticketNumber, pos: data.pos, customerName: data.customerName, timestamp: Date.now() };
                    setCurrentCalls(prev => ({ ...prev, [data.pos]: newCall }));
                    setLastCalledTicket(newCall);

                    setCounters(prev => prev.includes(data.pos) ? prev : [...prev, data.pos].sort());

                    audioRef.current?.play().catch(() => {
                        logger.warn('Audio autoplay blocked. Ensure browser is configured for autoplay in kiosk mode.');
                    });
                    speakAnnouncement(data.ticketNumber, data.pos);

                    if (data.nextTicketNumber) {
                        speakPrepare(data.nextTicketNumber);
                    }

                    setTimeout(() => setLastCalledTicket(null), 7000);
                }
            } catch (error) {
                logger.error('Error parsing display SSE message:', error);
            }
        };
        global.displayBoard_displayEventSource.onerror = () => setIsConnected(false);

        if (global.displayBoard_queueEventSource) global.displayBoard_queueEventSource.close();
        global.displayBoard_queueEventSource = new EventSource('/api/sse/queue');
        global.displayBoard_queueEventSource.onopen = () => setIsConnected(true);
        global.displayBoard_queueEventSource.onmessage = (event) => {
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
        global.displayBoard_queueEventSource.onerror = () => setIsConnected(false);

        return () => {
            if (global.displayBoard_displayEventSource) {
                global.displayBoard_displayEventSource.close();
                global.displayBoard_displayEventSource = undefined;
            }
            if (global.displayBoard_queueEventSource) {
                global.displayBoard_queueEventSource.close();
                global.displayBoard_queueEventSource = undefined;
            }
        };
    }, [speakAnnouncement, speakPrepare]);

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
        <div className="relative flex flex-col h-screen w-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden selection:bg-[#00BD7D]/10">
            {/* Subtle Brand Accents */}
            <div className="absolute top-0 left-0 w-full h-2 bg-[#00BD7D]" />
            <div className="absolute top-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#00BD7D]/5 blur-[100px] rounded-full pointer-events-none" />

            <header className="relative z-10 flex items-center justify-between px-12 py-6 bg-white border-b border-slate-200 shadow-sm">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-8 bg-[#00BD7D] rounded-full" />
                        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight uppercase text-[#00BD7D]">
                            BẢNG GỌI SỐ
                        </h1>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${isConnected ? 'bg-[#00BD7D]/5 border-[#00BD7D]/20' : 'bg-red-50 border-red-200'}`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-[#00BD7D] animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-xs font-bold uppercase tracking-widest ${isConnected ? 'text-[#00BD7D]' : 'text-red-600'}`}>
                            {isConnected ? 'Hệ thống trực tuyến' : 'Mất kết nối'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-6 text-slate-500">
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Thời gian</p>
                        <p className="text-2xl font-mono font-bold text-slate-700">{timeStr}</p>
                    </div>
                </div>
            </header>

            {!isConnected && (
                <div className="relative z-10 flex items-center justify-center gap-2 bg-red-50 border-b border-red-200 py-2">
                    <WifiOff className="w-4 h-4 text-red-600" aria-hidden="true" />
                    <span className="text-sm font-bold text-red-600">Mất kết nối máy chủ, đang thử kết nối lại...</span>
                </div>
            )}

            <main className="relative z-10 flex-1 p-8 overflow-y-auto">
                {isLoading ? (
                    <div className="flex h-full flex-col gap-8">
                        <div className="rounded-[28px] bg-white border border-slate-200 p-12 animate-pulse">
                            <div className="mx-auto h-6 w-40 rounded-full bg-slate-200" />
                            <div className="mx-auto mt-8 h-40 w-72 rounded-3xl bg-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="rounded-[28px] bg-white border border-slate-200 p-8 animate-pulse space-y-4">
                                    <div className="h-4 w-28 rounded-full bg-slate-200" />
                                    <div className="mx-auto h-20 w-36 rounded-2xl bg-slate-200" />
                                    <div className="h-4 w-24 rounded-full bg-slate-200" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <AnimatePresence mode="wait">
                            {lastCalledTicket && (
                                <motion.div
                                    role="status"
                                    aria-live="polite"
                                    initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 20 }}
                                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.1 }}
                                    className="mb-12 relative"
                                >
                                    <div className="relative flex flex-col items-center justify-center p-12 rounded-[28px] bg-white border-4 border-[#00BD7D] shadow-[0_20px_50px_rgba(0,189,125,0.15)]">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="relative flex items-center justify-center">
                                                <Bell className="w-6 h-6 text-[#00BD7D] animate-ring" aria-hidden="true" />
                                            </span>
                                            <span className="text-[#00BD7D] uppercase tracking-[0.3em] font-black text-sm">Đang gọi số</span>
                                        </div>
                                        <p className="font-[family-name:var(--font-display)] text-[12rem] font-semibold tracking-tight leading-none text-slate-900">
                                            {lastCalledTicket.ticketNumber}
                                        </p>
                                        <div className="flex items-center gap-12 mt-6">
                                            <div className="text-center">
                                                <p className="text-slate-500 uppercase text-xs font-bold tracking-widest mb-1">Vị trí</p>
                                                <p className="text-5xl font-bold text-slate-800">{lastCalledTicket.pos}</p>
                                            </div>
                                            <div className="w-px h-12 bg-slate-200" />
                                            <div className="text-center">
                                                <p className="text-slate-500 uppercase text-xs font-bold tracking-widest mb-1">Khách hàng</p>
                                                <p className="text-5xl font-bold text-slate-800">{lastCalledTicket.customerName || 'Quý khách'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                            {counterDisplayList.map(({ pos, call, isActive, isHighlighted, isBetweenCalls, waitingCount }, index) => (
                                <motion.div
                                    key={pos}
                                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                                    animate={reduceMotion ? false : { opacity: 1, y: 0 }}
                                    transition={{ delay: reduceMotion ? 0 : index * 0.05 }}
                                >
                                    <div className={`relative h-full rounded-[28px] border transition-all duration-500 p-8 flex flex-col justify-between
                                        ${isHighlighted
                                            ? 'border-[#00BD7D] bg-[#00BD7D]/5 shadow-lg shadow-[#00BD7D]/10'
                                            : isActive
                                                ? 'border-slate-200 bg-white shadow-sm'
                                                : isBetweenCalls
                                                    ? 'border-slate-200 bg-amber-50/60 border-dashed'
                                                    : 'border-slate-100 bg-slate-50/30'
                                        }
                                    `}>
                                        <div className="flex items-center justify-between mb-6">
                                            <span className="text-sm font-bold uppercase tracking-widest text-slate-500">
                                                {pos}
                                            </span>
                                            {isActive && (
                                                <span className="flex h-2.5 w-2.5 rounded-full bg-[#00BD7D] animate-pulse" />
                                            )}
                                        </div>

                                        <div className="flex flex-col items-center justify-center py-6">
                                            {isActive && call ? (
                                                <>
                                                    <p className="font-[family-name:var(--font-display)] text-7xl font-semibold tracking-tight leading-none text-slate-900 mb-2">
                                                        {call.ticketNumber}
                                                    </p>
                                                    <p className="text-sm font-bold uppercase tracking-wider text-[#00BD7D]">
                                                        Đang phục vụ
                                                    </p>
                                                </>
                                            ) : isBetweenCalls ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-4 py-1.5">
                                                        <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
                                                        <span className="text-sm font-bold text-amber-700">Sắp gọi tiếp</span>
                                                    </span>
                                                    <p className="text-base text-slate-500 font-medium">Đang chuẩn bị...</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="flex h-3 w-3 rounded-full bg-slate-300" />
                                                    <p className="text-lg text-slate-500 font-medium">Hiện đang rảnh</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Users className="w-4 h-4" aria-hidden="true" />
                                                <span className="text-xs font-bold uppercase tracking-tighter">Đang chờ</span>
                                            </div>
                                            <span className="text-xl font-mono font-bold text-slate-700">
                                                {waitingCount}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
            </main>

            <style jsx global>{`
                @keyframes ring {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
                .animate-ring::after {
                    content: '';
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border: 4px solid #00BD7D;
                    border-radius: 50%;
                    animation: ring 1.5s cubic-bezier(0, 0.2, 0.8, 1) infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .animate-ring::after {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    );
}
