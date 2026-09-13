import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { getBusinessDayBounds, getBusinessDayBoundsForYMD } from '@/lib/business-day';

function parseDateParam(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
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

        // Explicit YYYY-MM-DD params name Vietnam calendar dates; resolve them
        // to Vietnam-midnight instants. Missing bounds default to the
        // current Vietnam day.
        let startOfDay: Date;
        let endOfDay: Date;

        if (fromParam || toParam) {
            const from = fromParam ? parseDateParam(fromParam) : null;
            const to = toParam ? parseDateParam(toParam) : null;

            if (fromParam && !from) {
                return NextResponse.json({ error: 'Invalid from date', code: 'INVALID_DATE' }, { status: 400 });
            }
            if (toParam && !to) {
                return NextResponse.json({ error: 'Invalid to date', code: 'INVALID_DATE' }, { status: 400 });
            }

            const todayBounds = getBusinessDayBounds(new Date());
            // `to` defaults to `from`, mirroring the previous defaulting
            // rules; a missing side defaults to the current Vietnam day.
            const effectiveTo = to ?? from;
            const startBounds = from
                ? getBusinessDayBoundsForYMD(from.getFullYear(), from.getMonth() + 1, from.getDate())
                : todayBounds;
            const endBounds = effectiveTo
                ? getBusinessDayBoundsForYMD(
                      effectiveTo.getFullYear(),
                      effectiveTo.getMonth() + 1,
                      effectiveTo.getDate()
                  )
                : todayBounds;
            if (startBounds.startOfDay > endBounds.endOfDay) {
                return NextResponse.json({ error: 'from must not be after to', code: 'INVALID_RANGE' }, { status: 400 });
            }
            startOfDay = startBounds.startOfDay;
            endOfDay = endBounds.endOfDay;
        } else if (dateParam) {
            const d = parseDateParam(dateParam);
            if (!d) {
                return NextResponse.json({ error: 'Invalid date', code: 'INVALID_DATE' }, { status: 400 });
            }
            const bounds = getBusinessDayBoundsForYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
            startOfDay = bounds.startOfDay;
            endOfDay = bounds.endOfDay;
        } else {
            const bounds = getBusinessDayBounds(new Date());
            startOfDay = bounds.startOfDay;
            endOfDay = bounds.endOfDay;
        }

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

        const peakHours = [...hourlyData].sort((a, b) => b.count - a.count).slice(0, 5);

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
            peakHours,
            services: serviceBreakdown,
        });
    } catch (error) {
        logger.error('Fetch stats error:', error);
        return NextResponse.json({ error: 'Lỗi lấy thống kê', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
