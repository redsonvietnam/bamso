import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

function parseDateParam(value: string): Date | null {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d;
}

export async function GET(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');

        let startDate: Date;
        let endDate: Date;

        if (fromParam || toParam) {
            const from = fromParam ? parseDateParam(fromParam) : null;
            const to = toParam ? parseDateParam(toParam) : null;

            if (fromParam && !from) {
                return NextResponse.json({ error: 'Invalid from date', code: 'INVALID_DATE' }, { status: 400 });
            }
            if (toParam && !to) {
                return NextResponse.json({ error: 'Invalid to date', code: 'INVALID_DATE' }, { status: 400 });
            }

            const today = new Date();
            startDate = from ?? today;
            endDate = to ?? from ?? today;

            const startNormalized = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endNormalized = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            if (startNormalized > endNormalized) {
                return NextResponse.json({ error: 'from must not be after to', code: 'INVALID_RANGE' }, { status: 400 });
            }
        } else if (dateParam) {
            const d = parseDateParam(dateParam);
            if (!d) {
                return NextResponse.json({ error: 'Invalid date', code: 'INVALID_DATE' }, { status: 400 });
            }
            startDate = d;
            endDate = d;
        } else {
            startDate = new Date();
            endDate = new Date();
        }

        const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

        const totalTickets = await prisma.ticket.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        });

        const completedTickets = await prisma.ticket.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.COMPLETED },
        });

        const missedTickets = await prisma.ticket.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.MISSED },
        });

        const pendingTickets = await prisma.ticket.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.PENDING },
        });

        const activeTickets = await prisma.ticket.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay }, status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] } },
        });

        const completedWithTimes = await prisma.ticket.findMany({
            where: { createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.COMPLETED, completedAt: { not: null } },
            select: { createdAt: true, completedAt: true },
        });

        let avgWaitTimeSeconds = 0;
        if (completedWithTimes.length > 0) {
            const totalWaitMs = completedWithTimes.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
            avgWaitTimeSeconds = Math.round(totalWaitMs / completedWithTimes.length / 1000);
        }

        const ticketsPerHour = await prisma.ticket.groupBy({
            by: ['createdAt'],
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
            _count: { id: true },
        });

        const hourMap: Record<number, number> = {};
        for (let h = 0; h < 24; h++) {
            hourMap[h] = 0;
        }
        for (const t of ticketsPerHour) {
            const hour = t.createdAt.getHours();
            hourMap[hour] = (hourMap[hour] || 0) + t._count.id;
        }

        const hourlyData = Object.entries(hourMap).map(([hour, count]) => ({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            count,
        }));

        const services = await prisma.service.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
        });

        const serviceBreakdown = await Promise.all(
            services.map(async (service) => {
                const [total, completed, pending] = await Promise.all([
                    prisma.ticket.count({ where: { serviceId: service.id, createdAt: { gte: startOfDay, lte: endOfDay } } }),
                    prisma.ticket.count({ where: { serviceId: service.id, createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.COMPLETED } }),
                    prisma.ticket.count({ where: { serviceId: service.id, createdAt: { gte: startOfDay, lte: endOfDay }, status: TicketStatus.PENDING } }),
                ]);

                return { id: service.id, name: service.name, code: service.code, color: service.color, total, completed, pending };
            })
        );

        return NextResponse.json({
            summary: { total: totalTickets, completed: completedTickets, missed: missedTickets, pending: pendingTickets, active: activeTickets, avgWaitTimeSeconds },
            hourly: hourlyData,
            services: serviceBreakdown,
        });
    } catch (error) {
        logger.error('Fetch stats error:', error);
        return NextResponse.json({ error: 'Lỗi lấy thống kê', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
