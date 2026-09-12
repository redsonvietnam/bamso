import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/password';
import { UserRole } from '@/lib/constants';
import { requireRole } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { isBlankString } from '@/lib/api-validation';

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

        if (name !== undefined && isBlankString(name)) {
            return NextResponse.json(
                { error: 'name không được để trống', code: 'INVALID_FIELDS' },
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

class StaffDeleteError extends Error {
    constructor(public readonly code: 'NOT_FOUND' | 'LAST_ADMIN') {
        super(code);
    }
}

function isTransientLockError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    if (record.code === 'P2034') return true;
    const message = typeof record.message === 'string' ? record.message : '';
    return (
        message.includes('database is locked') ||
        message.includes('SQLITE_BUSY') ||
        message.includes('database table is locked')
    );
}

// Atomic last-admin guard at the persistence boundary: the target lookup,
// the delete, and the remaining-ADMIN count all run inside one transaction,
// with the count evaluated AFTER the delete. Concurrent deletes of the final
// admins serialize; every loser observes zero remaining admins and rolls
// back, so at least one ADMIN always survives. Transient lock conflicts are
// retried so the loser deterministically reaches the LAST_ADMIN rejection
// instead of surfacing a storage error.
async function deleteUserPreservingLastAdmin(id: string): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            await prisma.$transaction(async (tx) => {
                const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
                if (!target) {
                    throw new StaffDeleteError('NOT_FOUND');
                }
                await tx.user.delete({ where: { id } });
                if (target.role === UserRole.ADMIN) {
                    const remainingAdmins = await tx.user.count({ where: { role: UserRole.ADMIN } });
                    if (remainingAdmins < 1) {
                        throw new StaffDeleteError('LAST_ADMIN');
                    }
                }
            });
            return;
        } catch (error) {
            if (error instanceof StaffDeleteError) {
                throw error;
            }
            lastError = error;
            if (attempt < MAX_ATTEMPTS - 1 && isTransientLockError(error)) {
                await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
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

        await deleteUserPreservingLastAdmin(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof StaffDeleteError) {
            if (error.code === 'NOT_FOUND') {
                return NextResponse.json(
                    { error: 'Không tìm thấy nhân viên', code: 'NOT_FOUND' },
                    { status: 404 }
                );
            }
            return NextResponse.json(
                { error: 'Không thể xóa admin cuối cùng', code: 'LAST_ADMIN' },
                { status: 400 }
            );
        }
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
