import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';
import { TicketStatus, UserRole } from '@/lib/constants';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { authenticateOptional } from '@/lib/api-auth';

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];

/** Strip customerName/phone unless the caller is an authenticated STAFF/ADMIN. */
function redactTicketsForRole<T extends { customerName?: string | null; phone?: string | null }>(
    tickets: T[],
    role: string | null
) {
    if (role && STAFF_ROLES.includes(role)) return tickets;
    return tickets.map(({ customerName: _customerName, phone: _phone, ...rest }) => rest);
}

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        const { allowed } = await checkRateLimit(`tickets:${ip}`, RATE_LIMITS.tickets);
        if (!allowed) {
            return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
        }

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
        await broadcastQueueUpdate(ticket.serviceId);

        return NextResponse.json(ticket, { status: 201 });
    } catch (error) {
        logger.error('Ticket creation error:', error);
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

        const session = await authenticateOptional();
        const safeTickets = redactTicketsForRole(tickets, session?.role ?? null);

        return NextResponse.json(safeTickets);
    } catch (error) {
        logger.error('Fetch tickets error:', error);
        return NextResponse.json({ error: 'Lỗi lấy danh sách vé', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
