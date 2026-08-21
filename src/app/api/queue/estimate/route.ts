import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');

    if (!serviceId) {
      return NextResponse.json(
        { error: 'Missing serviceId', code: 'MISSING_SERVICE_ID' },
        { status: 400 }
      );
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const completedTickets = await prisma.ticket.findMany({
      where: {
        serviceId,
        status: 'COMPLETED',
        completedAt: { not: null },
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      select: { createdAt: true, completedAt: true },
    });

    if (completedTickets.length === 0) {
      return NextResponse.json({ avgServiceTimeSeconds: null });
    }

    const totalMs = completedTickets.reduce(
      (sum, t) => sum + (t.completedAt!.getTime() - t.createdAt.getTime()),
      0
    );
    const avgServiceTimeSeconds = Math.round(totalMs / completedTickets.length / 1000);

    return NextResponse.json({ avgServiceTimeSeconds });
  } catch (error) {
    logger.error('Fetch estimate error:', error);
    return NextResponse.json(
      { error: 'Lỗi lấy ước tính', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
