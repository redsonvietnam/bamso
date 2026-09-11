import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import { verifyPassword } from '@/lib/password';
import { signJWT } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isSecureCookie } from '@/lib/cookie';
import { writeAuditLog } from '@/lib/audit-service';
import {
    decryptMfaSecret,
    verifyTotp,
} from '@/lib/mfa-service';

const COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24;

export async function POST(request: Request) {
    try {
        const auth = await requireRole(UserRole.ADMIN);
        if ('error' in auth) return auth.error;

        const body = await request.json().catch(() => ({}));
        const { password, code } = body;

        // Invariant 11: Session possession alone cannot disable MFA
        if (!password || typeof password !== 'string' || !code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại và mã TOTP là bắt buộc để hủy MFA', code: 'INVALID_FIELDS' },
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
                action: 'MFA_DISABLED',
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

        // Only TOTP allowed for disable — recovery code must NOT disable MFA
        let verified = false;
        try {
            const secret = decryptMfaSecret(user.mfaSecret);
            verified = verifyTotp(code.trim(), secret, { window: 1 });
        } catch (err) {
            logger.error('MFA secret decryption error during disable:', err);
        }

        if (!verified) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_DISABLED',
                entityType: 'MFA',
                entityId: auth.payload.userId,
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Mã TOTP không hợp lệ', code: 'MFA_INVALID_TOKEN' },
                { status: 401 }
            );
        }

        // Atomically disable MFA and delete all associated recovery codes
        // Conditional updateMany ensures only one concurrent disable wins
        const disableResult = await prisma.$transaction(async (tx) => {
            await tx.recoveryCode.deleteMany({
                where: { userId: user.id },
            });
            const result = await tx.user.updateMany({
                where: { id: user.id, mfaEnabled: true },
                data: {
                    mfaEnabled: false,
                    mfaSecret: null,
                    mfaKeyVersion: null,
                    mfaEnabledAt: null,
                    enrollmentJti: null,
                },
            });
            return { alreadyDisabled: result.count === 0 } as const;
        });

        if (disableResult.alreadyDisabled) {
            return NextResponse.json(
                { error: 'MFA đã bị hủy bởi một yêu cầu khác', code: 'MFA_DISABLED_CONCURRENT' },
                { status: 409 }
            );
        }

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
            action: 'MFA_DISABLED',
            entityType: 'MFA',
            entityId: user.id,
            success: true,
        });

        // Reissue token without mfa assurance claim
        const token = await signJWT({
            userId: user.id,
            role: user.role as (typeof UserRole)[keyof typeof UserRole],
        });

        const response = NextResponse.json({
            success: true,
            message: 'Đã hủy kích hoạt xác thực hai yếu tố (MFA)',
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
        logger.error('MFA disable error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi khi hủy kích hoạt MFA', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
