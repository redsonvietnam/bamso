import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
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

        return NextResponse.json(ticket);
    } catch (error) {
        logger.error('Error tracking ticket:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống khi tra cứu vé', code: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        );
    }
}