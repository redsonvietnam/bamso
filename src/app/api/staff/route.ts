import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/password';
import { UserRole } from '@/lib/constants';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
    const auth = await requireRole('ADMIN');
    if ('error' in auth) {
        return auth.error as NextResponse;
    }

    try {
        const staff = await prisma.user.findMany({
            where: {
                role: { in: [UserRole.STAFF, UserRole.KIOSK, UserRole.DISPLAY] },
            },
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(staff);
    } catch (error) {
        logger.error('Fetch staff error:', error);
        return NextResponse.json(
            { error: 'Lỗi lấy danh sách nhân viên', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) {
            return auth.error as NextResponse;
        }

        const body = await request.json();
        const { username, password, name, role } = body;

        if (!username || !password || !name || !role) {
            return NextResponse.json(
                { error: 'username, password, name, role là bắt buộc', code: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return NextResponse.json(
                { error: passwordValidation.error, code: 'INVALID_PASSWORD' },
                { status: 400 }
            );
        }

        if (!['STAFF', 'KIOSK', 'DISPLAY'].includes(role)) {
            return NextResponse.json(
                { error: 'role phải là STAFF, KIOSK hoặc DISPLAY', code: 'INVALID_ROLE' },
                { status: 400 }
            );
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return NextResponse.json(
                { error: 'Tên đăng nhập đã tồn tại', code: 'DUPLICATE_USERNAME' },
                { status: 409 }
            );
        }

        const passwordHash = hashPassword(password);

        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                name,
                role: role as UserRole,
            },
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });

        return NextResponse.json(user, { status: 201 });
    } catch (error) {
        logger.error('Create staff error:', error);
        return NextResponse.json(
            { error: 'Lỗi tạo nhân viên', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request): Promise<NextResponse> {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) {
            return auth.error as NextResponse;
        }

        const body = await request.json();
        const { id, name, role, password } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'id là bắt buộc', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (role !== undefined) {
            if (!['STAFF', 'KIOSK', 'DISPLAY'].includes(role)) {
                return NextResponse.json(
                    { error: 'role phải là STAFF, KIOSK hoặc DISPLAY', code: 'INVALID_ROLE' },
                    { status: 400 }
                );
            }
            updateData.role = role;
        }
        if (password) {
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return NextResponse.json(
                    { error: passwordValidation.error, code: 'INVALID_PASSWORD' },
                    { status: 400 }
                );
            }
            updateData.passwordHash = hashPassword(password);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                updatedAt: true,
            },
        });

        return NextResponse.json(user);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json(
                { error: 'Không tìm thấy nhân viên', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }
        logger.error('Update staff error:', error);
        return NextResponse.json(
            { error: 'Lỗi cập nhật nhân viên', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request): Promise<NextResponse> {
    try {
        const auth = await requireRole('ADMIN');
        if ('error' in auth) {
            return auth.error as NextResponse;
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id là bắt buộc', code: 'MISSING_ID' },
                { status: 400 }
            );
        }

        await prisma.user.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json(
                { error: 'Không tìm thấy nhân viên', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }
        logger.error('Delete staff error:', error);
        return NextResponse.json(
            { error: 'Lỗi xóa nhân viên', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
