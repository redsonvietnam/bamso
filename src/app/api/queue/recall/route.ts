import { NextResponse } from 'next/server';
import { broadcastDisplayCall } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields } from '@/lib/api-validation';

export async function POST(request: Request) {
    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) return auth.error;

        const parsed = await readJsonObject(request);
        if (!parsed.ok) return parsed.response;
        const { serviceId, pos } = parsed.value;

        const missing = requiredStringFields(parsed.value, ['serviceId', 'pos']);
        if (missing.length > 0) {
            return NextResponse.json(
                { error: 'serviceId và pos phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const currentTicket = await prisma.ticket.findFirst({
            where: {
                serviceId: serviceId as string,
                pos: pos as string,
                status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            include: { service: true },
        });

        if (!currentTicket) {
            return NextResponse.json(
                { error: 'Không có vé đang phục vụ tại quầy này', code: 'NO_CURRENT_TICKET' },
                { status: 404 }
            );
        }

        const nextPending = await prisma.ticket.findFirst({
            where: {
                serviceId: serviceId as string,
                status: TicketStatus.PENDING,
                createdAt: { gte: startOfDay, lte: endOfDay },
                id: { not: currentTicket.id },
            },
            orderBy: { position: 'asc' },
        });

        await broadcastDisplayCall(
            currentTicket.ticketNumber,
            pos as string,
            currentTicket.customerName,
            nextPending?.ticketNumber
        );

        return NextResponse.json({
            ticketNumber: currentTicket.ticketNumber,
            pos: currentTicket.pos,
            customerName: currentTicket.customerName,
        });
    } catch (error) {
        logger.error('Recall ticket error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống';
        return NextResponse.json(
            { error: errorMessage, code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
