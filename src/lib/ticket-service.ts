import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';

const MAX_RETRIES = 5;

function getDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export async function createTicket(data: {
    serviceId: string;
    customerName?: string;
    phone?: string;
}) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await createTicketInternal(data);
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

async function createTicketInternal(data: {
    serviceId: string;
    customerName?: string;
    phone?: string;
}) {
    return await prisma.$transaction(async (tx) => {
        const service = await tx.service.findUnique({
            where: { id: data.serviceId },
        });

        if (!service || !service.isActive) {
            throw new Error('Dịch vụ không tồn tại hoặc đã ngừng hoạt động');
        }

        const now = new Date();
        const dayKey = getDayKey(now);
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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

        return await tx.ticket.create({
            data: {
                ...data,
                ticketNumber,
                dayKey,
                position,
                status: TicketStatus.PENDING,
            },
        });
    });
}
