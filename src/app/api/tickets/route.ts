import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';
import { TicketStatus, UserRole } from '@/lib/constants';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { authenticateOptional, requireRole } from '@/lib/api-auth';
import { readJsonObject, sanitizeApiError } from '@/lib/api-validation';

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.STAFF];

const ACTIVE_STATUSES = new Set<string>([TicketStatus.CALLED, TicketStatus.IN_PROGRESS]);

function redactTicketsForRole<T extends { customerName?: string | null; phone?: string | null; status?: string }>(
    tickets: T[],
    role: string | null
) {
    if (role && STAFF_ROLES.includes(role)) return tickets;
    return tickets.map(({ customerName, phone: _phone, status, ...rest }) => {
        if (status && ACTIVE_STATUSES.has(status)) {
            return { ...rest, customerName, status };
        }
        return rest;
    });
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

        if (!serviceId || typeof serviceId !== 'string' || serviceId.trim() === '') {
            return NextResponse.json(
                { error: 'serviceId là bắt buộc và phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        if (customerName !== undefined && customerName !== null && (typeof customerName !== 'string' || customerName.trim().length === 0)) {
            return NextResponse.json(
                { error: 'customerName phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.trim().length === 0)) {
            return NextResponse.json(
                { error: 'phone phải là chuỗi không rỗng', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        if (customerName !== undefined && customerName !== null && customerName.trim().length > 100) {
            return NextResponse.json(
                { error: 'customerName không được vượt quá 100 ký tự', code: 'FIELD_TOO_LONG' },
                { status: 400 }
            );
        }

        if (phone !== undefined && phone !== null && phone.trim().length > 20) {
            return NextResponse.json(
                { error: 'phone không được vượt quá 20 ký tự', code: 'FIELD_TOO_LONG' },
                { status: 400 }
            );
        }

        const ticket = await createTicket({
            serviceId,
            customerName: customerName as string | undefined,
            phone: phone as string | undefined,
        });

        void broadcastQueueUpdate(ticket.serviceId).catch((err) => {
            logger.error('Ticket queue broadcast failed:', err);
        });

        return NextResponse.json(ticket, { status: 201 });
    } catch (error) {
        logger.error('Ticket creation error:', error);
        const { message, isClientError } = sanitizeApiError(error);
        return NextResponse.json(
            { error: message, code: isClientError ? 'CLIENT_ERROR' : 'INTERNAL_ERROR' },
            { status: isClientError ? 400 : 500 }
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

const DELETABLE_STATUSES = new Set<string>([TicketStatus.COMPLETED, TicketStatus.MISSED]);

export async function DELETE(request: Request): Promise<NextResponse> {
    const auth = await requireRole(UserRole.ADMIN);
    if ('error' in auth) return auth.error as NextResponse;

    const parsed = await readJsonObject(request);
    if (!parsed.ok) return parsed.response as NextResponse;

    const { cutoff } = parsed.value as { cutoff?: string };

    if (!cutoff || typeof cutoff !== 'string') {
        return NextResponse.json(
            { error: 'cutoff là bắt buộc (YYYY-MM-DD)', code: 'INVALID_FIELDS' },
            { status: 400 }
        );
    }

    const dateParts = cutoff.split('-');
    if (dateParts.length !== 3) {
        return NextResponse.json(
            { error: 'cutoff phải có định dạng YYYY-MM-DD', code: 'INVALID_FIELDS' },
            { status: 400 }
        );
    }
    const [year, month, day] = dateParts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return NextResponse.json(
            { error: 'cutoff không hợp lệ', code: 'INVALID_FIELDS' },
            { status: 400 }
        );
    }
    const cutoffDate = new Date(year, month - 1, day);
    if (cutoffDate.getFullYear() !== year || cutoffDate.getMonth() !== month - 1 || cutoffDate.getDate() !== day) {
        return NextResponse.json(
            { error: 'cutoff không hợp lệ', code: 'INVALID_FIELDS' },
            { status: 400 }
        );
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (cutoffDate >= startOfToday) {
        return NextResponse.json(
            { error: 'cutoff phải trước ngày hôm nay', code: 'INVALID_FIELDS' },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const toDelete = await tx.ticket.findMany({
                where: {
                    createdAt: { lt: cutoffDate },
                    status: { in: Array.from(DELETABLE_STATUSES) },
                },
                select: { id: true },
            });

            if (toDelete.length === 0) {
                return { deleted: 0 };
            }

            const ids = toDelete.map((t) => t.id);
            const deleteResult = await tx.ticket.deleteMany({
                where: { id: { in: ids } },
            });

            return { deleted: deleteResult.count };
        });

        logger.log(`Bulk ticket cleanup: ${result.deleted} tickets deleted (cutoff: ${cutoff})`);

        return NextResponse.json({
            deleted: result.deleted,
            cutoff,
            message: `Đã xóa ${result.deleted} vé cũ`,
        });
    } catch (error) {
        logger.error('Bulk ticket cleanup error:', error);
        return NextResponse.json(
            { error: 'Lỗi khi xóa vé', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}