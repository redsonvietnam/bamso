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

const REGEN_FENCE_PREFIX = 'MFA_REGEN_FENCE:';

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
                action: 'MFA_BACKUP_CODES_REGENERATED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'INVALID_CREDENTIALS',
            });
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại không chính xác', code: 'INVALID_CREDENTIALS' }, { status: 401 }
            );
        }

        if (!user.mfaEnabled || !user.mfaSecret) {
            return NextResponse.json(
                { error: 'MFA chưa được kích hoạt cho tài khoản này', code: 'MFA_NOT_ENABLED' }, { status: 400 }
            );
        }

        const secret = decryptMfaSecret(user.mfaSecret);
        if (!verifyTotp(code.trim(), secret, { window: 1 })) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Mã xác thực không hợp lệ', code: 'MFA_INVALID_TOKEN' }, { status: 401 }
            );
        }

        const lock = await acquireRegenLock(user.id);
        if (lock === 'ALREADY_CLAIMED') {
            return NextResponse.json(
                { error: 'Đang có yêu cầu tạo lại mã khôi phục khác', code: 'MFA_REGEN_CONCURRENT' }, { status: 409 }
            );
        }
        if (lock === 'STORAGE_ERROR') {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED', entityType: 'MFA', entityId: user.id,
                success: false, reasonCode: 'MFA_REGEN_STORAGE_ERROR',
            });
            return NextResponse.json(
                { error: 'Không thể xác lập khóa đồng bộ MFA', code: 'MFA_REGEN_STORAGE_ERROR' }, { status: 503 }
            );
        }

        const fenceKey = `${REGEN_FENCE_PREFIX}${user.id}`;

        try {
            // Install this holder's fence only if it is newer than the persisted fence.
            const fenceRegistration = await prisma.$executeRaw`
                INSERT INTO "Settings" ("key", "value")
                VALUES (${fenceKey}, ${String(lock.fenceToken)})
                ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"
                WHERE CAST("Settings"."value" AS INTEGER) < CAST(excluded."value" AS INTEGER)
            `;

            if (fenceRegistration !== 1) {
                return NextResponse.json(
                    { error: 'Yêu cầu tạo lại mã khôi phục đã mất quyền đồng bộ', code: 'MFA_REGEN_STALE' }, { status: 409 }
                );
            }

            const newRecoveryCodes = generateRecoveryCodes(10);

            await prisma.$transaction(async (tx) => {
                // The write-CAS obtains the SQLite write boundary before the recovery
                // set mutation. A newer fence cannot overtake this transaction here.
                const fenceCheck = await tx.$executeRaw`
                    UPDATE "Settings"
                    SET "value" = "value"
                    WHERE "key" = ${fenceKey}
                      AND CAST("value" AS INTEGER) = ${lock.fenceToken}
                `;

                if (fenceCheck !== 1) throw new Error('MFA_REGEN_STALE');

                await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
                for (const plainCode of newRecoveryCodes) {
                    await tx.recoveryCode.create({
                        data: { userId: user.id, codeHash: hashRecoveryCode(plainCode) },
                    });
                }
            });

            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_BACKUP_CODES_REGENERATED', entityType: 'MFA', entityId: user.id,
                success: true, metadata: { fenceToken: String(lock.fenceToken) },
            });

            return NextResponse.json({ recoveryCodes: newRecoveryCodes });
        } catch (error) {
            if (error instanceof Error && error.message === 'MFA_REGEN_STALE') {
                return NextResponse.json(
                    { error: 'Yêu cầu tạo lại mã khôi phục đã mất quyền đồng bộ', code: 'MFA_REGEN_STALE' }, { status: 409 }
                );
            }
            throw error;
        } finally {
            await releaseRegenLock(user.id, lock.ownerToken);
        }
    } catch (error) {
        logger.error('MFA recovery codes regenerate error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi khi tạo lại mã khôi phục', code: 'SERVER_ERROR' }, { status: 500 }
        );
    }
}
