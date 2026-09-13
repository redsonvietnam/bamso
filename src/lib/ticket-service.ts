import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';
import { getBusinessDayBounds, getBusinessDayKey } from '@/lib/business-day';

const MAX_RETRIES = 5;

function getDayKey(date: Date): string {
    return getBusinessDayKey(date);
}

export async function createTicket(
    data: {
        serviceId: string;
        customerName?: string;
        phone?: string;
    },
    actor?: AuditActor
) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await createTicketInternal(data, actor);
        } catch (error) {
            // P2002 = unique constraint violation (ticketNumber collision)
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002' && attempt < MAX_RETRIES - 1) {
                continue;
            }
            throw error;
        }
    }
    throw new Error('Failed to create ticket after maximum retries');
}

async function createTicketInternal(
    data: {
        serviceId: string;
        customerName?: string;
        phone?: string;
    },
    actor?: AuditActor
) {
    return await prisma.$transaction(async (tx) => {
        const service = await tx.service.findUnique({
            where: { id: data.serviceId },
        });

        if (!service || !service.isActive) {
            throw new Error('Dịch vụ không tồn tại hoặc đã ngừng hoạt động');
        }

        const now = new Date();
        const dayKey = getDayKey(now);
        const { startOfDay, endOfDay } = getBusinessDayBounds(now);

        const dailyCount = await tx.ticket.count({
            where: {
                serviceId: data.serviceId,
                dayKey,
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
        });

        const maxPosResult = await tx.ticket.aggregate({
            where: {
                serviceId: data.serviceId,
                dayKey,
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            _max: { position: true },
        });

        const sequence = dailyCount + 1;
        const ticketNumber = `${service.prefix}${sequence}`;
        const position = (maxPosResult._max.position || 0) + 1;

        const ticket = await tx.ticket.create({
            data: {
                ...data,
                ticketNumber,
                dayKey,
                position,
                status: TicketStatus.PENDING,
            },
        });

        await writeAuditLog(tx, {
            actor: actor ?? { actorType: 'ANONYMOUS' },
            action: 'TICKET_CREATED',
            entityType: 'TICKET',
            entityId: ticket.id,
            success: true,
        });

        return ticket;
    });
}
