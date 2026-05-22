import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';
import { TicketStatus } from '@prisma/client';
import { broadcastQueueUpdate } from '@/lib/sse-broker';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { serviceId, customerName, phone } = body;

        if (!serviceId) {
            return NextResponse.json(
                { error: 'serviceId là bắt buộc', code: 'MISSING_SERVICE_ID' },
                { status: 400 }
            );
        }

        const ticket = await createTicket({
            serviceId,
            customerName,
            phone,
        });

        // Trigger SSE broadcast to update all queue listeners
        broadcastQueueUpdate(ticket.serviceId);

        return NextResponse.json(ticket, { status: 201 });
    } catch (error) {
        console.error('Ticket creation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo vé';
        return NextResponse.json(
            { error: errorMessage, code: 'INTERNAL_ERROR' },
            { status: errorMessage.includes('không tồn tại') ? 400 : 500 }
        );
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const status = searchParams.get('status') as TicketStatus | null;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    try {
        const tickets = await prisma.ticket.findMany({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                ...(serviceId && { serviceId }),
                ...(status && { status }),
            },
            orderBy: {
                position: 'asc',
            },
            include: {
                service: true,
            },
        });

        return NextResponse.json(tickets);
    } catch (error) {
        console.error('Fetch tickets error:', error);
        return NextResponse.json({ error: 'Lỗi lấy danh sách vé', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
