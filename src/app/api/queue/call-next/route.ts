import { NextResponse } from 'next/server';
import { callNextTicket, IdempotencyConflictError } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields, sanitizeQueueError } from '@/lib/api-validation';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';

export async function POST(request: Request) {
    let actor: AuditActor | null = null;
    let targetPos: string | null = null;

    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'UNAUTHORIZED',
            });
            return auth.error;
        }

        const payload = ('payload' in auth && auth.payload) ? auth.payload : auth;
        actor = {
            actorType: 'USER',
            actorId: (payload as { userId?: string })?.userId ?? null,
            actorRole: (payload as { role?: string })?.role ?? null,
        };

        const parsed = await readJsonObject(request);
        if (!parsed.ok) {
            await writeAuditLog(prisma, {
                actor,
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'INVALID_FIELDS',
            });
            return parsed.response;
        }
        const { serviceId, pos } = parsed.value;
        if (typeof pos === 'string') targetPos = pos;

        const missing = requiredStringFields(parsed.value, ['serviceId', 'pos']);
        if (missing.length > 0) {
            await writeAuditLog(prisma, {
                actor,
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'INVALID_FIELDS',
                metadata: targetPos ? { counter: targetPos } : null,
            });
            return NextResponse.json(
                { error: 'serviceId và pos phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        // One Idempotency-Key value represents one logical CALL-NEXT
        // operation. Blank header = legacy path with no idempotency record.
        const idempotencyKey = request.headers.get('idempotency-key')?.trim() || undefined;

        const { ticket, replayed, displayEvent } = actor?.actorId
            ? await callNextTicket(serviceId as string, pos as string, actor, { idempotencyKey })
            : await callNextTicket(serviceId as string, pos as string, undefined, { idempotencyKey });
        if (!ticket) {
            await writeAuditLog(prisma, {
                actor,
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'CALL_FAILED',
                metadata: targetPos ? { counter: targetPos } : null,
            });
            return NextResponse.json(
                { error: 'Không thể gọi vé', code: 'CALL_FAILED' },
                { status: 500 }
            );
        }

        // Fire-and-forget: broadcasts are best-effort side effects.
        // The business transaction is complete when callNextTicket succeeds.
        // Do not block the HTTP response on notification delivery.
        // Replays resolve to the canonical result with zero side effects:
        // the original attempt already broadcast, so a replay must not
        // announce the same logical operation a second time.
        //
        // CORE-06: The durable DisplayCallEvent was already created atomically
        // inside the transaction. Transport delivery is best-effort; the event
        // remains PENDING (recoverable via display reconnect) until the SSE
        // display endpoint marks it DELIVERED after successful server-side
        // enqueue. We do NOT mark DELIVERED here because broadcastDisplayCall
        // swallows transport failures via Promise.allSettled — marking
        // DELIVERED here would destroy recoverability.

        if (replayed || !displayEvent) {
            return NextResponse.json(ticket);
        }

        setImmediate(async () => {
            try {
                await Promise.allSettled([
                    broadcastQueueUpdate(displayEvent.serviceId),
                    broadcastDisplayCall(
                        displayEvent.eventId,
                        displayEvent.ticketNumber,
                        displayEvent.pos,
                        displayEvent.customerName,
                        displayEvent.nextTicketNumber ?? undefined,
                    ),
                ]);
                // Do NOT mark DELIVERED here. The event stays PENDING until
                // the SSE display endpoint successfully enqueues it during
                // reconnect or live subscription. This ensures transport
                // failures never destroy recoverability.
            } catch (err) {
                logger.error('Post-call-next broadcast failed:', err);
            }
        });

        return NextResponse.json(ticket);
    } catch (error) {
        if (error instanceof IdempotencyConflictError) {
            logger.warn('Call next idempotency conflict:', error);
            await writeAuditLog(prisma, {
                actor: actor ?? { actorType: 'ANONYMOUS' },
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'IDEMPOTENCY_CONFLICT',
                metadata: targetPos ? { counter: targetPos } : null,
            });
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status }
            );
        }
        logger.error('Call next error:', error);
        const { message, isClientError } = sanitizeQueueError(error);
        const isNoPending = message.includes('Không còn số thứ tự nào đang chờ');

        await writeAuditLog(prisma, {
            actor: actor ?? { actorType: 'ANONYMOUS' },
            action: 'CALL_NEXT',
            entityType: 'TICKET',
            success: false,
            reasonCode: isNoPending ? 'NO_PENDING_TICKETS' : isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR',
            metadata: targetPos ? { counter: targetPos } : null,
        });

        return NextResponse.json(
            { error: message, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
