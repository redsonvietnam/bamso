import { NextResponse } from 'next/server';
import { callNextTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields, sanitizeQueueError } from '@/lib/api-validation';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';

export async function POST(request: Request) {
    let actor: AuditActor | null = null;
    let targetPos: string | null = null;
    let callNextStartedAt: number | null = null;

    // A1: Request correlation ID
    const requestId = crypto.randomUUID?.() ?? `call-next-${Date.now()}`;

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

        // --- A1: Call-next observability ---
        callNextStartedAt = performance.now();
        logger.log('call-next-start', {
            requestId,
            serviceId,
            targetPos: pos,
        });

        const result = actor?.actorId
            ? await callNextTicket(serviceId as string, pos as string, actor, { includeDisplayEvent: true })
            : await callNextTicket(serviceId as string, pos as string, undefined, { includeDisplayEvent: true });
        const ticket = result.ticket;
        if (!ticket || !result.displayEvent) {
            await writeAuditLog(prisma, {
                actor,
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'CALL_FAILED',
                metadata: targetPos ? { counter: targetPos } : null,
            });
            const processingTimeMs = callNextStartedAt === null
                ? null
                : Math.round(performance.now() - callNextStartedAt);
            logger.error('call-next-failed', {
                requestId,
                errorMessage: 'Không thể gọi vé',
                isClientError: false,
                noPending: false,
                targetPos,
                processingTimeMs,
                eventId: null,
                eventStatus: null,
            });
            return NextResponse.json(
                { error: 'Không thể gọi vé', code: 'CALL_FAILED' },
                { status: 500 }
            );
        }

        // The display event is durably persisted in the same transaction as the ticket claim.
        // Transport remains fire-and-forget; a PENDING event is recoverable on display reconnect.
        const displayEvent = result.displayEvent;

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
            } catch (err) {
                logger.error('Post-call-next broadcast failed:', err);
            }
        });

        const processingTimeMs = callNextStartedAt === null
            ? null
            : Math.round(performance.now() - callNextStartedAt);

        // A1: Observability log - completed call-next
        logger.log('call-next-completed', {
            requestId,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            pos: ticket.pos,
            eventId: displayEvent.eventId,
            eventStatus: displayEvent.status,
            processingTimeMs,
        });

        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Call next error:', error);
        const { message, isClientError } = sanitizeQueueError(error);
        const isNoPending = message.includes('Không còn số thứ tự nào đang chờ');

        const processingTimeMs = callNextStartedAt === null
            ? null
            : Math.round(performance.now() - callNextStartedAt);

        await writeAuditLog(prisma, {
            actor: actor ?? { actorType: 'ANONYMOUS' },
            action: 'CALL_NEXT',
            entityType: 'TICKET',
            success: false,
            reasonCode: isNoPending ? 'NO_PENDING_TICKETS' : isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR',
            metadata: targetPos ? { counter: targetPos } : null,
        });

        // Structured error observability
        logger.error('call-next-failed', {
            requestId,
            errorMessage: message,
            isClientError,
            noPending: isNoPending,
            targetPos: targetPos,
            processingTimeMs,
            eventId: null,
            eventStatus: null,
        });

        return NextResponse.json(
            { error: message, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}