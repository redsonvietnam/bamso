import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { requireRole } from '@/lib/api-auth';

export async function GET(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        const targetDate = dateParam ? new Date(dateParam) : new Date();
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

        // Total tickets today
        const totalTickets = await prisma.ticket.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
        });

        // Completed tickets
        const completedTickets = await prisma.ticket.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: TicketStatus.COMPLETED,
            },
        });

        // Missed tickets
        const missedTickets = await prisma.ticket.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: TicketStatus.MISSED,
            },
        });

        // Currently pending
        const pendingTickets = await prisma.ticket.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: TicketStatus.PENDING,
            },
        });

        // Currently being served (CALLED or IN_PROGRESS)
        const activeTickets = await prisma.ticket.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
            },
        });

        // Average wait time (from createdAt to completedAt for completed tickets)
        const completedWithTimes = await prisma.ticket.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: TicketStatus.COMPLETED,
                completedAt: { not: null },
            },
            select: {
                createdAt: true,
                completedAt: true,
            },
        });

        let avgWaitTimeSeconds = 0;
        if (completedWithTimes.length > 0) {
            const totalWaitMs = completedWithTimes.reduce((sum, t) => {
                return sum + (t.completedAt!.getTime() - t.createdAt.getTime());
            }, 0);
            avgWaitTimeSeconds = Math.round(totalWaitMs / completedWithTimes.length / 1000);
        }

        // Tickets per hour (for chart)
        const ticketsPerHour = await prisma.ticket.groupBy({
            by: ['createdAt'],
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            _count: { id: true },
        });

        // Group by hour manually
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

        // Per-service breakdown
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

                return {
                    id: service.id,
                    name: service.name,
                    code: service.code,
                    color: service.color,
                    total,
                    completed,
                    pending,
                };
            })
        );

        return NextResponse.json({
            summary: {
                total: totalTickets,
                completed: completedTickets,
                missed: missedTickets,
                pending: pendingTickets,
                active: activeTickets,
                avgWaitTimeSeconds,
            },
            hourly: hourlyData,
            services: serviceBreakdown,
        });
    } catch (error) {
        console.error('Fetch stats error:', error);
        return NextResponse.json(
            { error: 'Lỗi lấy thống kê', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
