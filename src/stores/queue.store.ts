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

declare global {
    var queueEventSource: EventSource | undefined;
}

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
        if (global.queueEventSource) {
            global.queueEventSource.close();
        }

        set({ serviceId });

        // Load initial tickets via REST API before connecting SSE
        try {
            const tickets = await apiClient.get<ExtendedTicket[]>(`/api/tickets?serviceId=${serviceId}`);
            if (Array.isArray(tickets)) {
                get().setTickets(tickets);
            }
        } catch (error) {
            logger.error('Error fetching initial tickets:', error);
        }

        global.queueEventSource = new EventSource(`/api/sse/queue?serviceId=${serviceId}`);

        global.queueEventSource.onopen = () => set({ isConnected: true });

        global.queueEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'QUEUE_UPDATE' && Array.isArray(data.tickets)) {
                    get().setTickets(data.tickets);
                }
            } catch (error) {
                logger.error('Error parsing SSE message:', error);
            }
        };

        global.queueEventSource.onerror = () => {
            set({ isConnected: false });
        };
    },
    disconnectSSE: () => {
        if (global.queueEventSource) {
            global.queueEventSource.close();
            global.queueEventSource = undefined;
        }
        set({ isConnected: false, serviceId: null, tickets: [], snapshot: null });
    },
}));
