import { NextResponse } from 'next/server';
import { callNextTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields, sanitizeQueueError } from '@/lib/api-validation';

export async function POST(request: Request) {
    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) return auth.error;

        const parsed = await readJsonObject(request);
        if (!parsed.ok) return NextResponse.json(await parsed.response.json(), { status: parsed.response.status });
        const { serviceId, pos } = parsed.value;

        const missing = requiredStringFields(parsed.value, ['serviceId', 'pos']);
        if (missing.length > 0) {
            return NextResponse.json(
                { error: 'serviceId và pos phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = await callNextTicket(serviceId as string, pos as string);
        if (!ticket) {
            return NextResponse.json(
                { error: 'Không thể gọi vé', code: 'CALL_FAILED' },
                { status: 500 }
            );
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const nextPending = await prisma.ticket.findFirst({
            where: {
                serviceId: ticket.serviceId,
                status: TicketStatus.PENDING,
                createdAt: { gte: startOfDay, lte: endOfDay },
                id: { not: ticket.id },
            },
            orderBy: { position: 'asc' },
        });

        await Promise.all([
            broadcastQueueUpdate(ticket.serviceId),
            broadcastDisplayCall(ticket.ticketNumber, pos as string, ticket.customerName, nextPending?.ticketNumber)
        ]);

        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Call next error:', error);
        const { message, isClientError } = sanitizeQueueError(error);
        return NextResponse.json(
            { error: message, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
