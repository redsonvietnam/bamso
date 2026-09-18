import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';
import { getBusinessDayBounds, getBusinessDayKey } from '@/lib/business-day';

const MAX_RETRIES = 5;

function getDayKey(date: Date): string {
    return getBusinessDayKey(date);
}

// --- Idempotency error ---

export class IdempotencyConflictError extends Error {
    readonly code = 'IDEMPOTENCY_CONFLICT';
    readonly status = 409;

    constructor() {
        super('Idempotency-Key đã được sử dụng cho một thao tác khác.');
    }
}

// --- Fingerprint ---

function createTicketFingerprint(serviceId: string, customerName?: string, phone?: string): string {
    return JSON.stringify({
        serviceId,
        customerName: (customerName ?? '').trim().toLowerCase(),
        phone: (phone ?? '').trim(),
    });
}

// --- P2002 helpers ---

function isIdempotencyKeyConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as { code?: unknown; meta?: unknown };
    if (record.code !== 'P2002') return false;
    const meta = record.meta as { modelName?: unknown; target?: unknown } | undefined;
    if (meta?.modelName !== 'CreateTicketIdempotency') return false;
    const target = meta?.target;
    if (Array.isArray(target)) return target.includes('key');
    if (typeof target === 'string') return target === 'key' || target.includes('CreateTicketIdempotency');
    return false;
}

// --- Core ticket creation inside an existing transaction ---

type TxClient = Prisma.TransactionClient;

async function createTicketInTx(
    tx: TxClient,
    data: { serviceId: string; customerName?: string; phone?: string },
    actor?: AuditActor
) {
    const service = await tx.service.findUnique({
        where: { id: data.serviceId },
    });

    if (!service || !service.isActive) {
        throw new Error('Dịch vụ không tồn tại hoặc đã ngừng hoạt động');
    }

    const now = new Date();
    const dayKey = getDayKey(now);
    const { startOfDay, endOfDay } = getBusinessDayBounds(now);

    const dailyCount = await tx.ticket.count({
        where: {
            serviceId: data.serviceId,
            dayKey,
            createdAt: { gte: startOfDay, lte: endOfDay },
        },
    });

    const maxPosResult = await tx.ticket.aggregate({
        where: {
            serviceId: data.serviceId,
            dayKey,
            createdAt: { gte: startOfDay, lte: endOfDay },
        },
        _max: { position: true },
    });

    const sequence = dailyCount + 1;
    const ticketNumber = `${service.prefix}${sequence}`;
    const position = (maxPosResult._max.position || 0) + 1;

    const ticket = await tx.ticket.create({
        data: {
            ...data,
            ticketNumber,
            dayKey,
            position,
            status: TicketStatus.PENDING,
        },
    });

    await writeAuditLog(tx, {
        actor: actor ?? { actorType: 'ANONYMOUS' },
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: ticket.id,
        success: true,
    });

    return ticket;
}

// --- Legacy path (no idempotency) ---

async function createTicketInternal(
    data: { serviceId: string; customerName?: string; phone?: string },
    actor?: AuditActor
) {
    return await prisma.$transaction(async (tx) => createTicketInTx(tx, data, actor));
}

export async function createTicket(
    data: { serviceId: string; customerName?: string; phone?: string },
    actor?: AuditActor
) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await createTicketInternal(data, actor);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002' && attempt < MAX_RETRIES - 1) {
                continue;
            }
            throw error;
        }
    }
    throw new Error('Failed to create ticket after maximum retries');
}

// --- Idempotent path ---

export interface CreateTicketResult {
    ticket: {
        id: string;
        ticketNumber: string;
        serviceId: string;
        dayKey: string;
        position: number;
        status: string;
        customerName?: string | null;
        phone?: string | null;
        createdAt: Date;
    };
    replayed: boolean;
}

/**
 * Creates a ticket with idempotency-key support.
 *
 * - No key → legacy non-idempotent path
 * - Key + no existing record → create ticket + seal idempotency atomically
 * - Key + existing record + matching fingerprint → replay original result
 * - Key + existing record + mismatched fingerprint → 409 IDEMPOTENCY_CONFLICT
 * - P2002 on idempotency key (concurrent same-key) → retry reads winner's record
 */
export async function createTicketIdempotent(
    data: { serviceId: string; customerName?: string; phone?: string },
    idempotencyKey?: string | null,
    actor?: AuditActor
): Promise<CreateTicketResult> {
    if (!idempotencyKey) {
        const ticket = await createTicket(data, actor);
        return { ticket, replayed: false };
    }

    const fingerprint = createTicketFingerprint(data.serviceId, data.customerName, data.phone);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await prisma.$transaction(async (tx) => {
                const existing = await tx.createTicketIdempotency.findUnique({
                    where: { key: idempotencyKey },
                });

                if (existing) {
                    if (existing.fingerprint !== fingerprint) {
                        throw new IdempotencyConflictError();
                    }
                    const replayed = JSON.parse(existing.ticketJson) as CreateTicketResult['ticket'];
                    return { ticket: replayed, replayed: true };
                }

                await tx.createTicketIdempotency.create({
                    data: { key: idempotencyKey, fingerprint, ticketJson: '{}' },
                });

                const ticket = await createTicketInTx(tx, data, actor);

                await tx.createTicketIdempotency.update({
                    where: { key: idempotencyKey },
                    data: { ticketJson: JSON.stringify(ticket) },
                });

                return { ticket, replayed: false };
            });
        } catch (error) {
            if (isIdempotencyKeyConflict(error) && attempt < MAX_RETRIES - 1) {
                continue;
            }
            throw error;
        }
    }
    throw new Error('Failed to create ticket after maximum retries');
}
