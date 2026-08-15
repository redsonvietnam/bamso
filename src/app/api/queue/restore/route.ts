import { NextResponse } from 'next/server';
import { restoreTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { readJsonObject, requiredStringFields } from '@/lib/api-validation';

export async function PUT(request: Request) {
    try {
        const auth = await requireRole('STAFF', 'ADMIN');
        if ('error' in auth) return auth.error;

        const parsed = await readJsonObject(request);
        if (!parsed.ok) return parsed.response;
        const { ticketId } = parsed.value;

        if (requiredStringFields(parsed.value, ['ticketId']).length > 0) {
            return NextResponse.json(
                { error: 'ticketId phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = await restoreTicket(ticketId as string);
        if (!ticket) {
            return NextResponse.json(
                { error: 'Không tìm thấy vé', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }

        await broadcastQueueUpdate(ticket.serviceId);
        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Restore ticket error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống';
        const isClientError = errorMessage.includes('Không tìm thấy') || errorMessage.includes('Chỉ có thể khôi phục');
        return NextResponse.json(
            { error: errorMessage, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
        );
    }
}
