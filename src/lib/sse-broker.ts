import prisma from '@/lib/db';
import { redis, redisPubSub } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { UserRole } from '@/lib/constants';

const encoder = new TextEncoder();

const CHANNELS = {
    QUEUE_UPDATE: 'queue:updates',
    DISPLAY_CALL: 'display:calls',
} as const;

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];

/** Strip customerName/phone from tickets for clients that aren't authenticated staff. */
function redactForRole<T extends { customerName?: string | null; phone?: string | null }>(
    tickets: T[],
    role: string | null
) {
    if (role && STAFF_ROLES.includes(role)) return tickets;
    return tickets.map(({ customerName: _customerName, phone: _phone, ...rest }) => rest);
}

type QueueClient = {
    id: string;
    controller: ReadableStreamDefaultController;
    serviceId?: string | null;
    role?: string | null;
};

type DisplayClient = {
    id: string;
    controller: ReadableStreamDefaultController;
};

export class SSEBroker {
    private queueClients = new Set<QueueClient>();
    private displayClients = new Set<DisplayClient>();
    private initialized = false;

    private init() {
        if (this.initialized) return;
        this.initialized = true;

        // Subscribe to Redis channels for cross-instance synchronization
        // Fail-open: if Redis is unavailable, run in single-instance mode
        try {
            redisPubSub.subscribe(CHANNELS.QUEUE_UPDATE, CHANNELS.DISPLAY_CALL).catch((err) => {
                logger.error('Redis subscribe failed (single-instance mode):', err);
            });

            redisPubSub.on('message', (channel, message) => {
                try {
                    if (channel === CHANNELS.QUEUE_UPDATE) {
                        const { serviceId } = JSON.parse(message);
                        this.broadcastQueueUpdateLocal(serviceId);
                    } else if (channel === CHANNELS.DISPLAY_CALL) {
                        const { ticketNumber, pos, customerName, nextTicketNumber } = JSON.parse(message);
                        this.broadcastDisplayCallLocal(ticketNumber, pos, customerName, nextTicketNumber);
                    }
                } catch (err) {
                    logger.error('Redis message parse error:', err);
                }
            });
        } catch (err) {
            logger.error('Redis init failed (single-instance mode):', err);
        }
    }

    subscribeQueue(id: string, controller: ReadableStreamDefaultController, serviceId?: string | null, role?: string | null) {
        this.init();
        this.queueClients.add({ id, controller, serviceId, role });
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
        // Use Promise.allSettled to ensure both local and Redis broadcasts are attempted.
        const promises = [
            this.broadcastQueueUpdateLocal(serviceId).catch((err) => {
                logger.error('Local queue broadcast failed:', err);
            }),
            redis.publish(CHANNELS.QUEUE_UPDATE, JSON.stringify({ serviceId })).catch((err) => {
                logger.error('Redis publish queue update failed:', err);
            })
        ];
        await Promise.allSettled(promises);
    }

    private async broadcastQueueUpdateLocal(serviceId?: string) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // Always fetch all of today's tickets, then filter per-client below.
        // Filtering the query by serviceId would make client-all subscribers
        // (e.g. the display) receive only the updated service's tickets.
        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: { position: 'asc' },
            include: { service: true },
        });

        for (const client of this.queueClients) {
            if (!serviceId || !client.serviceId || client.serviceId === serviceId) {
                const filtered = client.serviceId
                    ? tickets.filter(t => t.serviceId === client.serviceId)
                    : tickets;
                const safe = redactForRole(filtered, client.role ?? null);

                const payload = JSON.stringify({ type: 'QUEUE_UPDATE', tickets: safe });
                const message = `data: ${payload}\n\n`;
                try {
                    client.controller.enqueue(encoder.encode(message));
                } catch {
                    this.unsubscribeQueue(client.id);
                }
            }
        }
    }

    async broadcastDisplayCall(ticketNumber: string, pos: string, customerName?: string | null, nextTicketNumber?: string) {
        const promises = [
            this.broadcastDisplayCallLocal(ticketNumber, pos, customerName, nextTicketNumber).catch((err) => {
                logger.error('Local display call broadcast failed:', err);
            }),
            redis.publish(CHANNELS.DISPLAY_CALL, JSON.stringify({ ticketNumber, pos, customerName, nextTicketNumber })).catch((err) => {
                logger.error('Redis publish display call failed:', err);
            })
        ];
        await Promise.allSettled(promises);
    }

    private async broadcastDisplayCallLocal(ticketNumber: string, pos: string, customerName?: string | null, nextTicketNumber?: string) {
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

global.sseBroker = sseBroker;

export const subscribeQueue = sseBroker.subscribeQueue.bind(sseBroker);
export const unsubscribeQueue = sseBroker.unsubscribeQueue.bind(sseBroker);
export const subscribeDisplay = sseBroker.subscribeDisplay.bind(sseBroker);
export const unsubscribeDisplay = sseBroker.unsubscribeDisplay.bind(sseBroker);
export const broadcastQueueUpdate = sseBroker.broadcastQueueUpdate.bind(sseBroker);
export const broadcastDisplayCall = sseBroker.broadcastDisplayCall.bind(sseBroker);
