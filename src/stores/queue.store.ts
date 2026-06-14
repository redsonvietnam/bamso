import { create } from 'zustand';
import { TicketStatus } from '@/lib/constants';
import type { Ticket, Service } from '@prisma/client';
import { logger } from '@/lib/logger';

type ExtendedTicket = Ticket & { service: Service };

interface QueueSnapshot {
    tickets: ExtendedTicket[];
    pendingCount: number;
    calledCount: number;
    completedCount: number;
    missedCount: number;
}

interface QueueState {
    tickets: ExtendedTicket[];
    snapshot: QueueSnapshot | null;
    isConnected: boolean;
    serviceId: string | null;
    setTickets: (tickets: ExtendedTicket[]) => void;
    setConnected: (connected: boolean) => void;
    connectSSE: (serviceId: string) => Promise<void>;
    disconnectSSE: () => void;
}

let currentEventSource: EventSource | null = null;

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
    serviceId: null,
    setTickets: (tickets) => {
        set({ tickets, snapshot: buildSnapshot(tickets) });
    },
    setConnected: (connected) => set({ isConnected: connected }),
    connectSSE: async (serviceId: string) => {
        // Disconnect existing if any
        if (currentEventSource) {
            currentEventSource.close();
        }

        set({ serviceId });

        // Load initial tickets via REST API before connecting SSE
        try {
            const res = await fetch(`/api/tickets?serviceId=${serviceId}`);
            if (res.ok) {
                const tickets = await res.json();
                if (Array.isArray(tickets)) {
                    get().setTickets(tickets);
                }
            }
        } catch (error) {
            logger.error('Error fetching initial tickets:', error);
        }

        currentEventSource = new EventSource(`/api/sse/queue?serviceId=${serviceId}`);

        currentEventSource.onopen = () => set({ isConnected: true });

        currentEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    get().setTickets(data.tickets);
                }
            } catch (error) {
                logger.error('Error parsing SSE message:', error);
            }
        };

        currentEventSource.onerror = () => {
            set({ isConnected: false });
        };
    },
    disconnectSSE: () => {
        if (currentEventSource) {
            currentEventSource.close();
            currentEventSource = null;
        }
        set({ isConnected: false, serviceId: null, tickets: [], snapshot: null });
    },
}));
