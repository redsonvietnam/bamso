import { NextResponse } from 'next/server';
import { skipTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate } from '@/lib/sse-broker';

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { ticketId } = body;

        if (!ticketId) {
            return NextResponse.json(
                { error: 'Thiếu thông tin ticketId', code: 'MISSING_TICKET_ID' },
                { status: 400 }
            );
        }

        const ticket = await skipTicket(ticketId);

        broadcastQueueUpdate(ticket.serviceId);

        return NextResponse.json(ticket);
    } catch (error) {
        console.error('Skip ticket error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống';
        const isClientError = errorMessage.includes('Không tìm thấy') || errorMessage.includes('không ở trạng thái');
        return NextResponse.json(
            { error: errorMessage, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
