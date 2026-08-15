import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';
import { TicketStatus, UserRole } from '@/lib/constants';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { authenticateOptional } from '@/lib/api-auth';
import { readJsonObject, requiredStringFields } from '@/lib/api-validation';

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];

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

        const parsed = await readJsonObject(request);
        if (!parsed.ok) return parsed.response;
        const { serviceId, customerName, phone } = parsed.value;

        if (requiredStringFields(parsed.value, ['serviceId']).length > 0) {
            return NextResponse.json(
                { error: 'serviceId phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const ticket = await createTicket({
            serviceId: serviceId as string,
            customerName: customerName as string | undefined,
            phone: phone as string | undefined,
        });

        void broadcastQueueUpdate(ticket.serviceId).catch((err) => {
            logger.error('Ticket queue broadcast failed:', err);
        });

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
                createdAt: { gte: startOfDay, lte: endOfDay },
                ...(serviceId && { serviceId }),
                ...(status && { status }),
            },
            orderBy: { position: 'asc' },
            include: { service: true },
        });

        const session = await authenticateOptional();
        return NextResponse.json(redactTicketsForRole(tickets, session?.role ?? null));
    } catch (error) {
        logger.error('Fetch tickets error:', error);
        return NextResponse.json({ error: 'Lỗi lấy danh sách vé', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
