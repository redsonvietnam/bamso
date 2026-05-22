import { NextResponse } from 'next/server';
import { callNextTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { serviceId, pos } = body;

        if (!serviceId || !pos) {
            return NextResponse.json(
                { error: 'Thiếu thông tin serviceId hoặc pos', code: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = await callNextTicket(serviceId, pos);

        // SSE Broadcast
        broadcastQueueUpdate(ticket.serviceId);
        broadcastDisplayCall(ticket.ticketNumber, pos);

        return NextResponse.json(ticket);
    } catch (error) {
        console.error('Call next error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống';
        const isNoTickets = errorMessage.includes('Không còn số thứ tự');
        return NextResponse.json(
            { error: errorMessage, code: isNoTickets ? 'QUEUE_EMPTY' : 'INTERNAL_ERROR' },
            { status: isNoTickets ? 404 : 500 }
        );
    }
}
