import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import { signJWT } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isSecureCookie } from '@/lib/cookie';
import { writeAuditLog } from '@/lib/audit-service';
import {
    verifyMfaSetupToken,
    consumeEnrollmentToken,
    verifyTotp,
    encryptMfaSecret,
    hashRecoveryCode,
} from '@/lib/mfa-service';

const COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24;

export async function POST(request: Request) {
    try {
        const auth = await requireRole(UserRole.ADMIN);
        if ('error' in auth) return auth.error;

        const body = await request.json().catch(() => ({}));
        const { setupToken, code } = body;

        if (!setupToken || typeof setupToken !== 'string' || !code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'setupToken và mã xác thực code là bắt buộc', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        const setup = await verifyMfaSetupToken(setupToken);
        if (!setup || setup.userId !== auth.payload.userId) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Phiên khởi tạo MFA không hợp lệ hoặc đã hết hạn', code: 'MFA_INVALID_TOKEN' },
                { status: 401 }
            );
        }

        // Validate TOTP BEFORE consuming enrollment token
        const isValid = verifyTotp(code.trim(), setup.secret, { window: 1 });
        if (!isValid) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Mã OTP xác nhận không chính xác. Vui lòng thử lại', code: 'MFA_INVALID_TOKEN' },
                { status: 400 }
            );
        }

        // Atomic enrollment token claim (prevents replay)
        const claimResult = await consumeEnrollmentToken(setup.jti);
        if (claimResult !== 'CLAIMED') {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'MFA_ENROLLMENT_REPLAY',
            });
            return NextResponse.json(
                { error: 'Token đăng ký MFA đã được sử dụng', code: 'MFA_ENROLLMENT_REPLAY' },
                { status: 401 }
            );
        }

        // Encrypt TOTP secret at rest with AES-256-GCM
        const { encryptedSecret, keyVersion } = encryptMfaSecret(setup.secret);

        // Transactionally save encrypted secret, mark MFA enabled, and store hashed recovery codes
        await prisma.$transaction(async (tx) => {
            await tx.recoveryCode.deleteMany({
                where: { userId: setup.userId },
            });

            for (const plainCode of setup.recoveryCodes) {
                const codeHash = hashRecoveryCode(plainCode);
                await tx.recoveryCode.create({
                    data: {
                        userId: setup.userId,
                        codeHash,
                    },
                });
            }

            await tx.user.update({
                where: { id: setup.userId },
                data: {
                    mfaEnabled: true,
                    mfaSecret: encryptedSecret,
                    mfaKeyVersion: keyVersion,
                    mfaEnabledAt: new Date(),
                },
            });
        });

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
            action: 'MFA_ENROLL_COMPLETED',
            entityType: 'MFA',
            entityId: auth.payload.userId,
            success: true,
        });

        // Upgrade current session with signed MFA assurance claim
        const token = await signJWT({
            userId: auth.payload.userId,
            role: auth.payload.role,
            mfa: true,
        });

        const response = NextResponse.json({
            success: true,
            message: 'Đã kích hoạt xác thực hai yếu tố (MFA) thành công',
        });

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecureCookie(request),
            sameSite: 'lax',
            path: '/',
            maxAge: MAX_AGE,
        });

        return response;
    } catch (error) {
        logger.error('MFA enroll confirm error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi khi xác nhận kích hoạt MFA', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
