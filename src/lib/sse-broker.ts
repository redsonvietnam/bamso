import prisma from '@/lib/db';
import { redis, redisPubSub } from '@/lib/redis';

const encoder = new TextEncoder();

const CHANNELS = {
    QUEUE_UPDATE: 'queue:updates',
    DISPLAY_CALL: 'display:calls',
} as const;

type QueueClient = {
    id: string;
    controller: ReadableStreamDefaultController;
    serviceId?: string | null;
};

type DisplayClient = {
    id: string;
    controller: ReadableStreamDefaultController;
};

class SSEBroker {
    private queueClients = new Set<QueueClient>();
    private displayClients = new Set<DisplayClient>();
    private initialized = false;

    private async init() {
        if (this.initialized) return;
        this.initialized = true;

        // Subscribe to Redis channels for cross-instance synchronization
        await redisPubSub.subscribe(CHANNELS.QUEUE_UPDATE, CHANNELS.DISPLAY_CALL);
        
        redisPubSub.on('message', async (channel, message) => {
            try {
                if (channel === CHANNELS.QUEUE_UPDATE) {
                    const { serviceId } = JSON.parse(message);
                    await this.broadcastQueueUpdateLocal(serviceId);
                } else if (channel === CHANNELS.DISPLAY_CALL) {
                    const { ticketNumber, pos, customerName, nextTicketNumber } = JSON.parse(message);
                    this.broadcastDisplayCallLocal(ticketNumber, pos, customerName, nextTicketNumber);
                }
            } catch (err) {
                console.error('[SSEBroker] Redis message parse error:', err);
            }
        });
    }

    subscribeQueue(id: string, controller: ReadableStreamDefaultController, serviceId?: string | null) {
        this.init();
        this.queueClients.add({ id, controller, serviceId });
    }

    unsubscribeQueue(id: string) {
        for (const client of this.queueClients) {
            if (client.id === id) {
                this.queueClients.delete(client);
                break;
            }
        }
    }

    subscribeDisplay(id: string, controller: ReadableStreamDefaultController) {
        this.init();
        this.displayClients.add({ id, controller });
    }

    unsubscribeDisplay(id: string) {
        for (const client of this.displayClients) {
            if (client.id === id) {
                this.displayClients.delete(client);
                break;
            }
        }
    }

    async broadcastQueueUpdate(serviceId?: string) {
        // Publish to Redis for all instances to pick up
        await redis.publish(CHANNELS.QUEUE_UPDATE, JSON.stringify({ serviceId }));
        // Also trigger local update immediately
        await this.broadcastQueueUpdateLocal(serviceId);
    }

    private async broadcastQueueUpdateLocal(serviceId?: string) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // OPTIMIZATION: Filter by serviceId directly in the DB query to avoid O(N) memory issues
        // We fetch all if serviceId is not provided, otherwise only for that service
        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                ...(serviceId && { serviceId }),
            },
            orderBy: { position: 'asc' },
            include: { service: true },
        });

        for (const client of this.queueClients) {
            // If the broadcast is for a specific service, only send to clients interested in that service
            if (!serviceId || !client.serviceId || client.serviceId === serviceId) {
                // Further filter for clients who only want a specific service if they provided one
                const filtered = client.serviceId
                    ? tickets.filter(t => t.serviceId === client.serviceId)
                    : tickets;

                const payload = JSON.stringify({ type: 'QUEUE_UPDATE', tickets: filtered });
                const message = `data: ${payload}\n\n`;
                try {
                    client.controller.enqueue(encoder.encode(message));
                } catch {
                    this.unsubscribeQueue(client.id);
                }
            }
        }
    }

    broadcastDisplayCall(ticketNumber: string, pos: string, customerName?: string | null, nextTicketNumber?: string) {
        // Publish to Redis for all instances to pick up
        redis.publish(CHANNELS.DISPLAY_CALL, JSON.stringify({ ticketNumber, pos, customerName, nextTicketNumber }));
        // Also trigger local update immediately
        this.broadcastDisplayCallLocal(ticketNumber, pos, customerName, nextTicketNumber);
    }

    private broadcastDisplayCallLocal(ticketNumber: string, pos: string, customerName?: string | null, nextTicketNumber?: string) {
        const payload = JSON.stringify({
            type: 'DISPLAY_CALL',
            ticketNumber,
            pos,
            customerName: customerName || null,
            ...(nextTicketNumber && { nextTicketNumber }),
        });
        const message = `data: ${payload}\n\n`;

        for (const client of this.displayClients) {
            try {
                client.controller.enqueue(encoder.encode(message));
            } catch {
                this.unsubscribeDisplay(client.id);
            }
        }

        const queuePayload = JSON.stringify({ type: 'DISPLAY_CALL', ticketNumber, pos, nextTicketNumber });
        const queueMessage = `data: ${queuePayload}\n\n`;
        for (const client of this.queueClients) {
            try {
                client.controller.enqueue(encoder.encode(queueMessage));
            } catch {
                this.unsubscribeQueue(client.id);
            }
        }
    }
}

declare global {
    var sseBroker: SSEBroker | undefined;
}

const sseBroker = global.sseBroker || new SSEBroker();

if (process.env.NODE_ENV !== 'production') {
    global.sseBroker = sseBroker;
}

export const subscribeQueue = sseBroker.subscribeQueue.bind(sseBroker);
export const unsubscribeQueue = sseBroker.unsubscribeQueue.bind(sseBroker);
export const subscribeDisplay = sseBroker.subscribeDisplay.bind(sseBroker);
export const unsubscribeDisplay = sseBroker.unsubscribeDisplay.bind(sseBroker);
export const broadcastQueueUpdate = sseBroker.broadcastQueueUpdate.bind(sseBroker);
export const broadcastDisplayCall = sseBroker.broadcastDisplayCall.bind(sseBroker);
