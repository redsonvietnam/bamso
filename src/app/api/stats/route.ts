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
        const serviceIdParam = searchParams.get('serviceId');

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

        const where: Record<string, unknown> = { createdAt: { gte: startOfDay, lte: endOfDay } };
        if (serviceIdParam) {
            where.serviceId = serviceIdParam;
        }

        const [totalTickets, completedTickets, missedTickets, pendingTickets, activeTickets] = await Promise.all([
            prisma.ticket.count({ where }),
            prisma.ticket.count({ where: { ...where, status: TicketStatus.COMPLETED } }),
            prisma.ticket.count({ where: { ...where, status: TicketStatus.MISSED } }),
            prisma.ticket.count({ where: { ...where, status: TicketStatus.PENDING } }),
            prisma.ticket.count({ where: { ...where, status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] } } }),
        ]);

        const [completedWithTickets, serviceList] = await Promise.all([
            prisma.ticket.findMany({
                where: { ...where, status: TicketStatus.COMPLETED, completedAt: { not: null } },
                select: { createdAt: true, completedAt: true },
            }),
            prisma.service.findMany({
                where: { isActive: true },
                orderBy: { order: 'asc' },
            }),
        ]);

        let avgWaitTimeSeconds = 0;
        if (completedWithTickets.length > 0) {
            const totalWaitMs = completedWithTickets.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()), 0);
            avgWaitTimeSeconds = Math.round(totalWaitMs / completedWithTickets.length / 1000);
        }

        const ticketsPerHour = await prisma.ticket.groupBy({
            by: ['createdAt'],
            where,
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

        const serviceBreakdown = await Promise.all(
            serviceList.map(async (service) => {
                const svcWhere = { ...where, serviceId: service.id };
                const [total, completed, pending] = await Promise.all([
                    prisma.ticket.count({ where: svcWhere }),
                    prisma.ticket.count({ where: { ...svcWhere, status: TicketStatus.COMPLETED } }),
                    prisma.ticket.count({ where: { ...svcWhere, status: TicketStatus.PENDING } }),
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
