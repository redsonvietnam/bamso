import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import { verifyPassword } from '@/lib/password';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit-service';
import {
    generateTotpSecret,
    generateRecoveryCodes,
    generateOtpAuthUri,
    createMfaSetupToken,
} from '@/lib/mfa-service';

export async function POST(request: Request) {
    try {
        const auth = await requireRole(UserRole.ADMIN);
        if ('error' in auth) return auth.error;

        const body = await request.json().catch(() => ({}));
        const { password } = body;

        if (!password || typeof password !== 'string') {
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại là bắt buộc để bắt đầu đăng ký MFA', code: 'MISSING_CREDENTIALS' }, { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: auth.payload.userId },
            select: { id: true, username: true, role: true, passwordHash: true, mfaEnabled: true },
        });

        if (!user || !verifyPassword(password, user.passwordHash)) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_STARTED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'INVALID_CREDENTIALS',
            });
            return NextResponse.json(
                { error: 'Mật khẩu hiện tại không chính xác', code: 'INVALID_CREDENTIALS' }, { status: 401 }
            );
        }

        if (user.mfaEnabled) {
            return NextResponse.json(
                { error: 'MFA đã được kích hoạt cho tài khoản này', code: 'MFA_ALREADY_ENABLED' }, { status: 400 }
            );
        }

        const secret = generateTotpSecret(20);
        const recoveryCodes = generateRecoveryCodes(10);
        const qrUri = generateOtpAuthUri({ secret, username: user.username, issuer: 'BAMSO' });
        const enrollmentJti = crypto.randomUUID();

        // The authoritative generation transition commits before the setup token is
        // created/returned. Once this commits, every prior generation is stale.
        await prisma.user.update({ where: { id: user.id }, data: { enrollmentJti } });

        const setupToken = await createMfaSetupToken({
            userId: user.id,
            secret,
            recoveryCodes,
            jti: enrollmentJti,
        });

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
            action: 'MFA_ENROLL_STARTED', entityType: 'MFA', entityId: user.id,
            success: true, metadata: { enrollmentJti },
        });

        return NextResponse.json({ secret, qrUri, recoveryCodes, setupToken });
    } catch (error) {
        logger.error('MFA enroll start error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi khi khởi tạo đăng ký MFA', code: 'SERVER_ERROR' }, { status: 500 }
        );
    }
}
