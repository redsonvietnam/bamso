import { NextResponse } from 'next/server';
import { restoreTicket } from '@/lib/queue-service';
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

        const ticket = await restoreTicket(ticketId);

        broadcastQueueUpdate(ticket.serviceId);

        return NextResponse.json(ticket);
    } catch (error: any) {
        console.error('Restore ticket error:', error);
        const isClientError = error.message.includes('Không tìm thấy') || error.message.includes('Chỉ có thể khôi phục');
        return NextResponse.json(
            { error: error.message || 'Lỗi hệ thống', code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
