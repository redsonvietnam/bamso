import { NextResponse } from 'next/server';
import { completeTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields, sanitizeQueueError } from '@/lib/api-validation';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';

export async function PUT(request: Request) {
    let actor: AuditActor | null = null;
    let targetTicketId: string | null = null;

    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'COMPLETE',
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
                action: 'COMPLETE',
                entityType: 'TICKET',
                success: false,
                reasonCode: 'INVALID_FIELDS',
            });
            return parsed.response;
        }
        const { ticketId } = parsed.value;
        if (typeof ticketId === 'string') targetTicketId = ticketId;

        if (requiredStringFields(parsed.value, ['ticketId']).length > 0) {
            await writeAuditLog(prisma, {
                actor,
                action: 'COMPLETE',
                entityType: 'TICKET',
                entityId: targetTicketId,
                success: false,
                reasonCode: 'INVALID_FIELDS',
            });
            return NextResponse.json(
                { error: 'ticketId phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = actor?.actorId
            ? await completeTicket(ticketId as string, actor)
            : await completeTicket(ticketId as string);
        if (!ticket) {
            await writeAuditLog(prisma, {
                actor,
                action: 'COMPLETE',
                entityType: 'TICKET',
                entityId: targetTicketId,
                success: false,
                reasonCode: 'NOT_FOUND',
            });
            return NextResponse.json(
                { error: 'Không tìm thấy vé', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }

        await broadcastQueueUpdate(ticket.serviceId);
        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Complete ticket error:', error);
        const { message, isClientError } = sanitizeQueueError(error);
        const reasonCode = message.includes('Không tìm thấy')
            ? 'NOT_FOUND'
            : message.includes('không ở trạng thái')
                ? 'INVALID_STATUS'
                : isClientError
                    ? 'CLIENT_ERROR'
                    : 'INTERNAL_ERROR';

        await writeAuditLog(prisma, {
            actor: actor ?? { actorType: 'ANONYMOUS' },
            action: 'COMPLETE',
            entityType: 'TICKET',
            entityId: targetTicketId,
            success: false,
            reasonCode,
        });

        return NextResponse.json(
            { error: message, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
