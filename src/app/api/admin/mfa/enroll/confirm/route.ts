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
                { error: 'setupToken và mã xác thực code là bắt buộc', code: 'INVALID_FIELDS' }, { status: 400 }
            );
        }

        const setup = await verifyMfaSetupToken(setupToken);
        if (!setup || setup.userId !== auth.payload.userId) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Phiên khởi tạo MFA không hợp lệ hoặc đã hết hạn', code: 'MFA_INVALID_TOKEN' }, { status: 401 }
            );
        }

        const claimResult = await consumeEnrollmentToken(setup.jti);
        if (claimResult !== 'CLAIMED') {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false,
                reasonCode: claimResult === 'STORAGE_ERROR' ? 'MFA_ENROLLMENT_STORAGE_ERROR' : 'MFA_ENROLLMENT_REPLAY',
                metadata: { enrollmentJti: setup.jti },
            });
            return NextResponse.json(
                {
                    error: claimResult === 'STORAGE_ERROR' ? 'Không thể xác thực trạng thái phiên đăng ký MFA' : 'Token đăng ký MFA đã được sử dụng',
                    code: claimResult === 'STORAGE_ERROR' ? 'MFA_ENROLLMENT_STORAGE_ERROR' : 'MFA_ENROLLMENT_REPLAY',
                },
                { status: claimResult === 'STORAGE_ERROR' ? 503 : 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: auth.payload.userId },
            select: { enrollmentJti: true, mfaEnabled: true },
        });
        if (!user || user.enrollmentJti !== setup.jti || user.mfaEnabled) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'MFA_ENROLLMENT_STALE',
                metadata: { enrollmentJti: setup.jti },
            });
            return NextResponse.json(
                { error: 'Token đăng ký MFA đã bị vô hiệu hóa bởi phiên đăng ký mới hơn', code: 'MFA_ENROLLMENT_STALE' }, { status: 409 }
            );
        }

        if (!verifyTotp(code.trim(), setup.secret, { window: 1 })) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'MFA_INVALID_TOKEN', metadata: { enrollmentJti: setup.jti },
            });
            return NextResponse.json(
                { error: 'Mã OTP xác nhận không chính xác. Vui lòng thử lại', code: 'MFA_INVALID_TOKEN' }, { status: 400 }
            );
        }

        const { encryptedSecret, keyVersion } = encryptMfaSecret(setup.secret);

        const enrollmentResult = await prisma.$transaction(async (tx) => {
            await tx.recoveryCode.deleteMany({ where: { userId: setup.userId } });
            for (const plainCode of setup.recoveryCodes) {
                await tx.recoveryCode.create({
                    data: { userId: setup.userId, codeHash: hashRecoveryCode(plainCode) },
                });
            }

            // Final CAS is the authoritative START-vs-CONFIRM boundary. If a newer
            // START committed first, zero rows are updated and the transaction rolls back.
            return tx.user.updateMany({
                where: { id: setup.userId, enrollmentJti: setup.jti, mfaEnabled: false },
                data: {
                    mfaEnabled: true,
                    mfaSecret: encryptedSecret,
                    mfaKeyVersion: keyVersion,
                    mfaEnabledAt: new Date(),
                    enrollmentJti: null,
                },
            });
        });

        if (enrollmentResult.count !== 1) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
                action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
                success: false, reasonCode: 'MFA_ENROLLMENT_STALE', metadata: { enrollmentJti: setup.jti },
            });
            return NextResponse.json(
                { error: 'Token đăng ký MFA đã bị vô hiệu hóa bởi phiên đăng ký mới hơn', code: 'MFA_ENROLLMENT_STALE' }, { status: 409 }
            );
        }

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: auth.payload.userId, actorRole: auth.payload.role },
            action: 'MFA_ENROLL_COMPLETED', entityType: 'MFA', entityId: auth.payload.userId,
            success: true, metadata: { enrollmentJti: setup.jti },
        });

        const token = await signJWT({ userId: auth.payload.userId, role: auth.payload.role, mfa: true });
        const response = NextResponse.json({ success: true, message: 'Đã kích hoạt xác thực hai yếu tố (MFA) thành công' });
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
            { error: 'Đã xảy ra lỗi khi xác nhận kích hoạt MFA', code: 'SERVER_ERROR' }, { status: 500 }
        );
    }
}
