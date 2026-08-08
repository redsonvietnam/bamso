"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket } from '@prisma/client';
import { TicketStatus } from '@/lib/constants';
import { Users, Bell, Clock, WifiOff } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useSpeech } from '@/hooks/useSpeech';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { PageWatermark } from '@/components/ui/dong-son-motif';

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
        const map: Record<string, Ticket[]> = {};
        for (const t of allTickets) {
            if (t.status === TicketStatus.PENDING) {
                (map[t.serviceId] = map[t.serviceId] || []).push(t);
            }
        }
        for (const key of Object.keys(map)) {
            map[key].sort((a, b) => a.position - b.position);
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
            const pendingTickets = serviceId ? pendingByServiceId[serviceId] ?? [] : [];
            return {
                pos: counter,
                call,
                serviceId,
                isActive: !!call,
                isBetweenCalls: !call && !!prevInfo,
                waitingCount: pendingTickets.length,
                nextWaiting: pendingTickets.slice(0, 5),
                isHighlighted: lastCalledTicket?.pos === counter &&
                    lastCalledTicket?.ticketNumber === call?.ticketNumber,
            };
        }).sort((a, b) => a.pos.localeCompare(b.pos));
    }, [counters, currentCalls, lastCalledTicket, pendingByServiceId, ticketServiceMap, previousCalls]);

    const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="relative flex flex-col h-screen w-screen bg-background text-foreground font-sans overflow-hidden selection:bg-[color:var(--display-accent-20)]">
            {/* Brand accent line */}
            <div className="absolute top-0 left-0 w-full h-2 bg-[color:var(--display-red)]" />
            <PageWatermark className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem] opacity-[0.15]" />

            <header className="header-chrome relative z-10 flex items-center justify-between gap-6 px-8 md:px-12 py-4 bg-white/80 backdrop-blur-sm border-b border-border shadow-sm">
                <div className="flex items-center gap-5 min-w-0">
                    <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/brand/bca/huy-hieu-cong-an-nhan.png" alt="Logo" className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-lg sm:text-xl font-black uppercase tracking-wide text-brand-red">CÔNG AN TỈNH LÂM ĐỒNG</p>
                        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wide text-foreground">CÔNG AN XÃ NÂM NUNG</h1>
                    </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                    <div className={`flex items-center gap-2 sticker px-3 py-1 rounded-full border transition-colors ${isConnected ? 'bg-[color:var(--display-accent-10)] border-[color:var(--display-accent-30)]' : 'bg-red-50 border-red-300'}`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-[color:var(--display-accent)] animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-xs font-bold uppercase tracking-widest ${isConnected ? 'text-foreground' : 'text-red-600'}`}>
                            {isConnected ? 'Hệ thống trực tuyến' : 'Mất kết nối'}
                        </span>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Hệ thống lấy số dịch vụ công</p>
                        <p className="text-2xl font-mono font-bold text-foreground">{timeStr}</p>
                    </div>
                </div>
            </header>

            {!isConnected && (
                <div className="relative z-10 flex items-center justify-center gap-2 bg-red-50 border-b border-red-200 py-2">
                    <WifiOff className="w-4 h-4 text-red-600" aria-hidden="true" />
                    <span className="text-sm font-bold text-red-700">Mất kết nối máy chủ, đang thử kết nối lại...</span>
                </div>
            )}

            <main className="relative z-10 flex-1 p-8 overflow-y-auto">
                {isLoading ? (
                    <div className="flex h-full flex-col gap-8">
                        <div className="rounded-[28px] bg-card border border-border p-12 animate-pulse">
                            <div className="mx-auto h-6 w-40 rounded-full bg-muted-foreground/15" />
                            <div className="mx-auto mt-8 h-40 w-72 rounded-3xl bg-muted-foreground/15" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="overflow-hidden rounded-[24px] border-2 border-border bg-card animate-pulse">
                                    <div className="h-1.5 bg-muted-foreground/15" />
                                    <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-border">
                                        <div className="w-10 h-10 rounded-xl bg-muted-foreground/15" />
                                        <div className="h-4 w-28 rounded-full bg-muted-foreground/15" />
                                    </div>
                                    <div className="flex flex-col items-center justify-center px-6 py-8 min-h-[170px] space-y-4">
                                        <div className="mx-auto h-16 w-36 rounded-2xl bg-muted-foreground/15" />
                                        <div className="h-4 w-24 rounded-full bg-muted-foreground/15" />
                                    </div>
                                    <div className="px-6 py-5 border-t border-border bg-muted/50 flex items-center justify-between">
                                        <div className="h-4 w-20 rounded-full bg-muted-foreground/15" />
                                        <div className="h-6 w-8 rounded-md bg-muted-foreground/15" />
                                    </div>
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
                                    <div className="relative flex flex-col items-center justify-center p-12 rounded-[28px] bg-card border-4 border-[color:var(--display-accent)] shadow-[0_20px_50px_var(--display-accent-15)]">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="relative flex items-center justify-center">
                                                <Bell className="w-6 h-6 text-[color:var(--display-accent)] animate-ring" aria-hidden="true" />
                                            </span>
                                            <span className="text-foreground uppercase tracking-[0.3em] font-black text-sm">Đang gọi số</span>
                                        </div>
                                        <p className="font-display text-[12rem] font-semibold tracking-tight leading-none text-foreground">
                                            {lastCalledTicket.ticketNumber}
                                        </p>
                                        <div className="flex items-center gap-12 mt-6">
                                            <div className="text-center">
                                                <p className="text-muted-foreground uppercase text-xs font-bold tracking-widest mb-1">Vị trí</p>
                                                <p className="text-5xl font-bold text-foreground">{lastCalledTicket.pos}</p>
                                            </div>
                                            <div className="w-px h-12 bg-border" />
                                            <div className="text-center">
                                                <p className="text-muted-foreground uppercase text-xs font-bold tracking-widest mb-1">Khách hàng</p>
                                                <p className="text-5xl font-bold text-foreground">{lastCalledTicket.customerName || 'Quý khách'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {counterDisplayList.map(({ pos, call, serviceId, isActive, isHighlighted, isBetweenCalls, waitingCount, nextWaiting }, index) => (
                                <motion.div
                                    key={pos}
                                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                                    animate={reduceMotion ? false : { opacity: 1, y: 0 }}
                                    transition={{ delay: reduceMotion ? 0 : index * 0.05 }}
                                    className="h-full"
                                >
                                    <div className={`relative h-full overflow-hidden rounded-[24px] border-2 bg-card shadow-sm flex flex-col transition-all duration-500
                                        ${isHighlighted
                                            ? 'border-[color:var(--display-accent)] ring-4 ring-[color:var(--display-accent-20)] shadow-lg shadow-[color:var(--display-accent-10)]'
                                            : isActive
                                                ? 'border-[color:var(--display-accent)]'
                                                : isBetweenCalls
                                                    ? 'border-amber-400/60 border-dashed bg-amber-400/5'
                                                    : 'border-border'
                                        }
                                    `}>
                                        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isActive ? 'bg-[color:var(--display-accent)]' : isBetweenCalls ? 'bg-amber-400' : 'bg-muted'}`} />

                                        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-border">
                                            <div className="flex items-center gap-3">
                                                <span className={`flex items-center justify-center w-10 h-10 rounded-xl text-lg font-black
                                                    ${isActive ? 'bg-[color:var(--display-accent-15)] text-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                    {index + 1}
                                                </span>
                                                <span className="text-base font-black uppercase tracking-widest text-foreground">
                                                    {pos}
                                                </span>
                                            </div>
                                            {isActive && (
                                                <span className="flex h-3 w-3 rounded-full bg-[color:var(--display-accent)] animate-pulse" />
                                            )}
                                        </div>

                                        <div className="flex flex-col items-center justify-center px-6 py-8 min-h-[170px] flex-1">
                                            {isActive && call ? (
                                                <>
                                                    <p className="font-display text-7xl font-semibold tracking-tight leading-none text-foreground mb-2">
                                                        {call.ticketNumber}
                                                    </p>
                                                    <p className="text-sm font-bold uppercase tracking-wider text-foreground">
                                                        Đang phục vụ
                                                    </p>
                                                </>
                                            ) : isBetweenCalls ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    <span className="inline-flex items-center gap-1.5 sticker rounded-full bg-amber-50 border border-amber-300 px-4 py-1.5">
                                                        <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
                                                        <span className="text-sm font-bold text-amber-700">Sắp gọi tiếp</span>
                                                    </span>
                                                    <p className="text-base text-muted-foreground font-medium">Đang chuẩn bị...</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="flex h-3 w-3 rounded-full bg-muted-foreground/20" />
                                                    <p className="text-lg text-muted-foreground font-medium">Hiện đang rảnh</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="px-6 py-5 border-t border-border bg-muted/50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Users className="w-4 h-4" aria-hidden="true" />
                                                    <span className="text-xs font-bold uppercase tracking-tighter">Đang chờ</span>
                                                </div>
                                                <span className="text-xl font-mono font-bold text-foreground">
                                                    {waitingCount}
                                                </span>
                                            </div>
                                            {serviceId && nextWaiting.length > 0 && (
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">
                                                        Sắp gọi
                                                    </span>
                                                    {nextWaiting.map(t => (
                                                        <span
                                                            key={t.id}
                                                            className="inline-flex items-center rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-sm font-bold text-foreground"
                                                        >
                                                            {t.ticketNumber}
                                                        </span>
                                                    ))}
                                                    {waitingCount > nextWaiting.length && (
                                                        <span className="text-xs font-semibold text-muted-foreground">
                                                            +{waitingCount - nextWaiting.length}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
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
                    border: 4px solid var(--display-accent);
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
