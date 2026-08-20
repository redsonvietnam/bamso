import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { authenticateOptional } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];

function redactTicket<T extends { customerName?: string | null; phone?: string | null }>(
    ticket: T,
    role: string | null
): T {
    if (role && STAFF_ROLES.includes(role)) return ticket;
    const { customerName: _customerName, phone: _phone, ...rest } = ticket;
    return rest as T;
}

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`track:${ip}`, RATE_LIMITS.track);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json(
            { error: 'Tham số tìm kiếm (query) là bắt buộc', code: 'MISSING_QUERY_PARAM' },
            { status: 400 }
        );
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    try {
        const ticket = await prisma.ticket.findFirst({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                OR: [
                    { ticketNumber: query },
                    { phone: query },
                    { id: query }, // Support lookup by UUID (used by /waiting page)
                ],
            },
            include: {
                service: true,
            },
        });

        if (!ticket) {
            return NextResponse.json(
                { error: 'Không tìm thấy vé hợp lệ', code: 'TICKET_NOT_FOUND' },
                { status: 404 }
            );
        }

        const session = await authenticateOptional();
        return NextResponse.json(redactTicket(ticket, session?.role ?? null));
    } catch (error) {
        logger.error('Error tracking ticket:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống khi tra cứu vé', code: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        );
    }
}
