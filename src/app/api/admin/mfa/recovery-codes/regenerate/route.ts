import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import { verifyPassword } from '@/lib/password';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit-service';
import {
    decryptMfaSecret,
    verifyTotp,
    generateRecoveryCodes,
    hashRecoveryCode,
} from '@/lib/mfa-service';
import { acquireRegenLock, releaseRegenLock } from '@/lib/mfa-redis';

export async function POST(request: Request) {
    try {
        const auth = await requireRole(UserRole.ADMIN);
        if ('error' in auth) return auth.error;

        const body = await request.json().catch(() => ({}));
        const { password, code } = body;

        if (!password || typeof password !== 'string' || !code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại và mã xác thực là bắt buộc để tạo lại mã khôi phục', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: auth.payload.userId },
            select: { id: true, username: true, role: true, passwordHash: true, mfaEnabled: true, mfaSecret: true },
        });

        if (!user || !verifyPassword(password, user.passwordHash)) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'INVALID_CREDENTIALS',
            });
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại không chính xác', code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        if (!user.mfaEnabled || !user.mfaSecret) {
            return NextResponse.json(
                { error: 'MFA chưa được kích hoạt cho tài khoản này', code: 'MFA_NOT_ENABLED' },
                { status: 400 }
            );
        }

        const secret = decryptMfaSecret(user.mfaSecret);
        const validTotp = verifyTotp(code.trim(), secret, { window: 1 });
        if (!validTotp) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Mã xác thực không hợp lệ', code: 'MFA_INVALID_TOKEN' },
                { status: 401 }
            );
        }

        // Concurrency guard: only one regeneration per user at a time
        const lockResult = await acquireRegenLock(user.id);
        if (lockResult !== 'CLAIMED') {
            return NextResponse.json(
                { error: 'Đang có yêu cầu tạo lại mã khôi phục khác', code: 'MFA_REGEN_CONCURRENT' },
                { status: 409 }
            );
        }

        try {
            const newRecoveryCodes = generateRecoveryCodes(10);

            // Transactionally replace all existing recovery codes with new hashed codes
            await prisma.$transaction(async (tx) => {
                await tx.recoveryCode.deleteMany({
                    where: { userId: user.id },
                });

                for (const plainCode of newRecoveryCodes) {
                    const codeHash = hashRecoveryCode(plainCode);
                    await tx.recoveryCode.create({
                        data: {
                            userId: user.id,
                            codeHash,
                        },
                    });
                }
            });

            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED',
                entityType: 'MFA',
                entityId: user.id,
                success: true,
            });

            return NextResponse.json({
                recoveryCodes: newRecoveryCodes,
            });
        } finally {
            await releaseRegenLock(user.id);
        }
    } catch (error) {
        logger.error('MFA recovery codes regenerate error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi khi tạo lại mã khôi phục', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
