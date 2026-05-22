import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';

export async function createTicket(data: {
    serviceId: string;
    customerName?: string;
    phone?: string;
}) {
    return await prisma.$transaction(async (tx) => {
        // 1. Lấy thông tin dịch vụ
        const service = await tx.service.findUnique({
            where: { id: data.serviceId },
        });

        if (!service || !service.isActive) {
            throw new Error('Dịch vụ không tồn tại hoặc đã ngừng hoạt động');
        }

        // 2. Xác định khoảng thời gian của ngày hiện tại (Local Time)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // 3. Tính số thứ tự vé trong ngày (để sinh ticketNumber)
        const dailyCount = await tx.ticket.count({
            where: {
                serviceId: data.serviceId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });

        // 4. Tính vị trí hàng đợi (position)
        // Lấy max position hiện tại của ngày hôm nay để đảm bảo thứ tự tăng dần không trùng lặp
        const maxPosResult = await tx.ticket.aggregate({
            where: {
                serviceId: data.serviceId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            _max: {
                position: true,
            },
        });

        const sequence = dailyCount + 1;
        const ticketNumber = `${service.prefix}${sequence.toString().padStart(3, '0')}`;
        const position = (maxPosResult._max.position || 0) + 1;

        // 5. Tạo vé mới
        return await tx.ticket.create({
            data: {
                ...data,
                ticketNumber,
                position,
                status: TicketStatus.PENDING,
            },
        });
    });
}
