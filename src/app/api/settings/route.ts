import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (key) {
            const setting = await prisma.settings.findUnique({
                where: { key },
            });
            return NextResponse.json(setting ? { key: setting.key, value: setting.value } : { key, value: null });
        }

        const settings = await prisma.settings.findMany();
        return NextResponse.json(settings);
    } catch (error) {
        logger.error('Fetch settings error:', error);
        return NextResponse.json(
            { error: 'Lỗi lấy cài đặt', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return NextResponse.json(
                { error: 'key và value là bắt buộc', code: 'MISSING_PARAMS' },
                { status: 400 }
            );
        }

        const setting = await prisma.settings.upsert({
            where: { key },
            update: { value },
            create: { key, value },
        });

        return NextResponse.json(setting);
    } catch (error) {
        logger.error('Update settings error:', error);
        return NextResponse.json(
            { error: 'Lỗi cập nhật cài đặt', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
