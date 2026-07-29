import { NextResponse } from 'next/server';
import { callNextTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const { serviceId, pos } = body;

        if (!serviceId || !pos) {
            return NextResponse.json(
                { error: 'Thiếu thông tin serviceId hoặc pos', code: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = await callNextTicket(serviceId, pos);
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
                serviceId,
                status: TicketStatus.PENDING,
                createdAt: { gte: startOfDay, lte: endOfDay },
                id: { not: ticket.id },
            },
            orderBy: { position: 'asc' },
        });

        broadcastQueueUpdate(ticket.serviceId);
        broadcastDisplayCall(ticket.ticketNumber, pos, ticket.customerName, nextPending?.ticketNumber);

        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Call next error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống';
        const isNoTickets = errorMessage.includes('Không còn số thứ tự');
        return NextResponse.json(
            { error: errorMessage, code: isNoTickets ? 'QUEUE_EMPTY' : 'INTERNAL_ERROR' },
            { status: isNoTickets ? 404 : 500 }
        );
    }
}
