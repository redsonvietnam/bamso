import { create } from 'zustand';
import { TicketStatus } from '@/lib/constants';
import type { Ticket, Service } from '@prisma/client';
import { logger } from '@/lib/logger';
import { apiClient } from '@/lib/api-client';

type ExtendedTicket = Ticket & { service: Service };

interface QueueSnapshot {
    tickets: ExtendedTicket[];
    pendingCount: number;
    calledCount: number;
    completedCount: number;
    missedCount: number;
}

export type QueueLifecycleStatus =
    | 'initial-loading'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'load-error';

interface QueueState {
    tickets: ExtendedTicket[];
    snapshot: QueueSnapshot | null;
    isConnected: boolean;
    status: QueueLifecycleStatus;
    loadError: string | null;
    serviceId: string | null;
    setTickets: (tickets: ExtendedTicket[]) => void;
    setConnected: (connected: boolean) => void;
    connectSSE: (serviceId: string) => Promise<void>;
    disconnectSSE: () => void;
}

declare global {
    var queueEventSource: EventSource | undefined;
}

// Monotonic generation: guards the async REST load and SSE callbacks of a
// superseded connectSSE call (service switch / unmount) from mutating state
// owned by the latest generation. Small, local, no reconnect architecture.
let connectGeneration = 0;

function buildSnapshot(tickets: ExtendedTicket[]): QueueSnapshot {
    return {
        tickets,
        pendingCount: tickets.filter((t) => t.status === TicketStatus.PENDING).length,
        calledCount: tickets.filter((t) => t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_PROGRESS).length,
        completedCount: tickets.filter((t) => t.status === TicketStatus.COMPLETED).length,
        missedCount: tickets.filter((t) => t.status === TicketStatus.MISSED).length,
    };
}

export const useQueueStore = create<QueueState>((set, get) => ({
    tickets: [],
    snapshot: null,
    isConnected: false,
    status: 'disconnected',
    loadError: null,
    serviceId: null,
    setTickets: (tickets) => {
        set({ tickets, snapshot: buildSnapshot(tickets) });
    },
    setConnected: (connected) => set({
        isConnected: connected,
        status: connected ? 'connected' : 'disconnected',
    }),
    connectSSE: async (serviceId: string) => {
        const generation = ++connectGeneration;

        // Disconnect existing if any
        if (global.queueEventSource) {
            global.queueEventSource.close();
            global.queueEventSource = undefined;
        }

        // Explicit initial loading: never present a stale or incomplete
        // empty queue as a legitimate empty state.
        set({ serviceId, status: 'initial-loading', loadError: null, isConnected: false, tickets: [], snapshot: null });

        // Load initial tickets via REST API before connecting SSE
        try {
            const tickets = await apiClient.get<ExtendedTicket[]>(`/api/tickets?serviceId=${serviceId}`);
            if (generation !== connectGeneration || get().serviceId !== serviceId) return;
            if (Array.isArray(tickets)) {
                get().setTickets(tickets);
            }
            if (get().status === 'initial-loading') {
                set({ status: 'connecting' });
            }
        } catch (error) {
            if (generation !== connectGeneration || get().serviceId !== serviceId) return;
            const message = error instanceof Error ? error.message : 'Không thể tải hàng đợi.';
            logger.error('Error fetching initial tickets:', error);
            // Explicit load failure: distinct from a successful empty queue.
            // Tickets stay empty and the SSE channel below may still recover.
            set({ status: 'load-error', loadError: message, isConnected: false, tickets: [], snapshot: null });
        }

        if (generation !== connectGeneration || get().serviceId !== serviceId) return;

        global.queueEventSource = new EventSource(`/api/sse/queue?serviceId=${serviceId}`);
        const eventSource = global.queueEventSource;

        eventSource.onopen = () => {
            if (generation !== connectGeneration) return;
            set({ status: 'connected', isConnected: true });
        };

        eventSource.onmessage = (event) => {
            if (generation !== connectGeneration) return;
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    get().setTickets(data.tickets);
                    set({ status: 'connected', isConnected: true, loadError: null });
                }
            } catch (error) {
                logger.error('Error parsing SSE message:', error);
            }
        };

        eventSource.onerror = () => {
            if (generation !== connectGeneration) return;
            // Preserve existing tickets: the operator keeps seeing the last
            // known state, explicitly marked stale. Never imply realtime is
            // healthy when the channel is down.
            const current = get();
            if (current.status === 'load-error') {
                set({ isConnected: false });
                return;
            }
            const wasConnected = current.status === 'connected' || current.isConnected;
            set({
                status: wasConnected ? 'reconnecting' : 'disconnected',
                isConnected: false,
            });
        };
    },
    disconnectSSE: () => {
        connectGeneration++;
        if (global.queueEventSource) {
            global.queueEventSource.close();
            global.queueEventSource = undefined;
        }
        set({ isConnected: false, serviceId: null, tickets: [], snapshot: null, status: 'disconnected', loadError: null });
    },
}));
