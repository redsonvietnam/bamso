import prisma from '@/lib/db';
import { pubSub, CHANNELS } from '@/lib/pub-sub';

const encoder = new TextEncoder();

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

    private init() {
        if (this.initialized) return;
        this.initialized = true;

        pubSub.subscribe(CHANNELS.QUEUE_UPDATE, async (_channel, message) => {
            try {
                const { serviceId } = JSON.parse(message);
                await this.broadcastQueueUpdateLocal(serviceId);
            } catch {
                // ignore parse errors
            }
        });

        pubSub.subscribe(CHANNELS.DISPLAY_CALL, (_channel, message) => {
            try {
                const { ticketNumber, pos, customerName, nextTicketNumber } = JSON.parse(message);
                this.broadcastDisplayCallLocal(ticketNumber, pos, customerName, nextTicketNumber);
            } catch {
                // ignore parse errors
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
        await pubSub.publish(CHANNELS.QUEUE_UPDATE, JSON.stringify({ serviceId }));
        await this.broadcastQueueUpdateLocal(serviceId);
    }

    private async broadcastQueueUpdateLocal(serviceId?: string) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const allTickets = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: { position: 'asc' },
            include: { service: true },
        });

        for (const client of this.queueClients) {
            const filtered = client.serviceId
                ? allTickets.filter(t => t.serviceId === client.serviceId)
                : allTickets;

            if (!serviceId || !client.serviceId || client.serviceId === serviceId) {
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
        pubSub.publish(CHANNELS.DISPLAY_CALL, JSON.stringify({ ticketNumber, pos, customerName, nextTicketNumber }));
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
