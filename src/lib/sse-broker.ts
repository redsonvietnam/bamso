import prisma from '@/lib/db';
import { TicketStatus } from '@prisma/client';

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

    subscribeQueue(id: string, controller: ReadableStreamDefaultController, serviceId?: string | null) {
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
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                ...(serviceId && { serviceId }),
            },
            orderBy: {
                position: 'asc',
            },
            include: {
                service: true,
            },
        });

        const payload = JSON.stringify({ type: 'QUEUE_UPDATE', tickets });
        const message = `data: ${payload}\n\n`;

        for (const client of this.queueClients) {
            if (!serviceId || !client.serviceId || client.serviceId === serviceId) {
                try {
                    client.controller.enqueue(encoder.encode(message));
                } catch {
                    this.unsubscribeQueue(client.id);
                }
            }
        }
    }

    broadcastDisplayCall(ticketNumber: string, pos: string) {
        const payload = JSON.stringify({ type: 'DISPLAY_CALL', ticketNumber, pos });
        const message = `data: ${payload}\n\n`;

        for (const client of this.displayClients) {
            try {
                client.controller.enqueue(encoder.encode(message));
            } catch {
                this.unsubscribeDisplay(client.id);
            }
        }
    }
}

// Singleton pattern for HMR support in development
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

