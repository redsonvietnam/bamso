import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { validateAllowedModes } from '@/lib/api-validation';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get('active') === 'true';

        const services = await prisma.service.findMany({
            where: activeOnly ? { isActive: true } : {},
            orderBy: { order: 'asc' },
        });

        return NextResponse.json(services);
    } catch (error) {
        logger.error('Fetch services error:', error);
        return NextResponse.json(
            { error: 'Lỗi lấy danh sách dịch vụ', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const { code, name, description, color, prefix, order } = body;

        if (!code || !name || !color || !prefix) {
            return NextResponse.json(
                { error: 'code, name, color, prefix là bắt buộc', code: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        const existing = await prisma.service.findUnique({ where: { code } });
        if (existing) {
            return NextResponse.json(
                { error: 'Mã dịch vụ đã tồn tại', code: 'DUPLICATE_CODE' },
                { status: 409 }
            );
        }

        const service = await prisma.service.create({
            data: {
                code,
                name,
                description: description || null,
                color,
                prefix,
                order: order || 0,
            },
        });

        return NextResponse.json(service, { status: 201 });
    } catch (error) {
        logger.error('Create service error:', error);
        return NextResponse.json(
            { error: 'Lỗi tạo dịch vụ', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const { id, code, name, description, color, prefix, order, allowedModes } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'id là bắt buộc', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {};
        if (code !== undefined) updateData.code = code;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description || null;
        if (color !== undefined) updateData.color = color;
        if (prefix !== undefined) updateData.prefix = prefix;
        if (order !== undefined) updateData.order = order;
        if (allowedModes !== undefined) {
            const modesValidation = validateAllowedModes(allowedModes);
            if (!modesValidation.valid) {
                return NextResponse.json(
                    { error: modesValidation.error, code: 'INVALID_MODES' },
                    { status: 400 }
                );
            }
            updateData.allowedModes = modesValidation.normalized;
        }

        const service = await prisma.service.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(service);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json(
                { error: 'Không tìm thấy dịch vụ', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }
        logger.error('Update service error:', error);
        return NextResponse.json(
            { error: 'Lỗi cập nhật dịch vụ', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) return auth.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id là bắt buộc', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        // Check if service has tickets
        const ticketCount = await prisma.ticket.count({
            where: { serviceId: id },
        });

        if (ticketCount > 0) {
            // Soft delete: set isActive = false instead of hard delete
            const service = await prisma.service.update({
                where: { id },
                data: { isActive: false },
            });
            return NextResponse.json(service);
        }

        await prisma.service.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json(
                { error: 'Không tìm thấy dịch vụ', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }
        logger.error('Delete service error:', error);
        return NextResponse.json(
            { error: 'Lỗi xóa dịch vụ', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
