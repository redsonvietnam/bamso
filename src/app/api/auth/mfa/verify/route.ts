import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signJWT } from '@/lib/auth';
import { UserRole } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/rate-limit';
import { isSecureCookie } from '@/lib/cookie';
import { writeAuditLog } from '@/lib/audit-service';
import {
    verifyMfaChallengeToken,
    consumeMfaChallenge,
    decryptMfaSecret,
    verifyTotp,
    verifyAndConsumeRecoveryCode,
    checkMfaRateLimit,
    recordMfaAttemptFailure,
    recordMfaAttemptSuccess,
} from '@/lib/mfa-service';

const COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24;

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);

        // Pre-flight IP rate limit check (read-only, no mutation)
        const ipRateLimit = await checkMfaRateLimit(`mfa:ip:${ip}`);
        if (!ipRateLimit.allowed) {
            return NextResponse.json(
                {
                    error: 'Quá nhiều lần thử MFA thất bại. Vui lòng thử lại sau',
                    code: 'MFA_RATE_LIMITED',
                    retryAfterSeconds: ipRateLimit.retryAfterSeconds,
                },
                { status: 429 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const { challengeToken, code, factor } = body;

        if (!challengeToken || typeof challengeToken !== 'string' || !code || typeof code !== 'string') {
            return NextResponse.json(
                { error: 'Mã xác thực và challengeToken là bắt buộc', code: 'INVALID_FIELDS' },
                { status: 400 }
            );
        }

        // Explicit factor mode: 'totp' | 'recovery'
        const isRecovery = factor === 'recovery';
        const isTotp = factor === 'totp';

        if (!isRecovery && !isTotp) {
            return NextResponse.json(
                { error: 'factor phải là "totp" hoặc "recovery"', code: 'INVALID_FACTOR' },
                { status: 400 }
            );
        }

        // Validate factor format upfront
        if (isTotp && !/^\d{6}$/.test(code.trim())) {
            return NextResponse.json(
                { error: 'Mã TOTP phải gồm đúng 6 chữ số', code: 'INVALID_TOTP_FORMAT' },
                { status: 400 }
            );
        }

        const challenge = await verifyMfaChallengeToken(challengeToken);
        if (!challenge) {
            // Single authoritative failure record for invalid challenge
            await recordMfaAttemptFailure(`mfa:ip:${ip}`);
            await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
            });
            return NextResponse.json(
                { error: 'Phiên xác thực MFA không hợp lệ hoặc đã hết hạn', code: 'MFA_INVALID_TOKEN' },
                { status: 401 }
            );
        }

        // Account-level brute force check (read-only)
        const userRateLimit = await checkMfaRateLimit(`mfa:user:${challenge.userId}`);
        if (!userRateLimit.allowed) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: challenge.userId, actorRole: challenge.role },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                entityId: challenge.userId,
                success: false,
                reasonCode: 'MFA_RATE_LIMITED',
            });
            return NextResponse.json(
                {
                    error: 'Tài khoản tạm thời bị khóa do thử sai MFA quá số lần quy định',
                    code: 'MFA_RATE_LIMITED',
                    retryAfterSeconds: userRateLimit.retryAfterSeconds,
                },
                { status: 429 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: challenge.userId },
            select: { id: true, username: true, name: true, role: true, mfaEnabled: true, mfaSecret: true },
        });

        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: challenge.userId, actorRole: challenge.role },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                entityId: challenge.userId,
                success: false,
                reasonCode: 'MFA_NOT_ENABLED',
            });
            return NextResponse.json(
                { error: 'MFA chưa được kích hoạt cho tài khoản này', code: 'MFA_NOT_ENABLED' },
                { status: 400 }
            );
        }

        if (isRecovery) {
            // Recovery code path
            const consumed = await prisma.$transaction(async (tx) => {
                return verifyAndConsumeRecoveryCode(tx, user.id, code.trim());
            });

            if (!consumed) {
                // Single authoritative failure record for bad recovery code
                await recordMfaAttemptFailure(`mfa:user:${user.id}`);
                await recordMfaAttemptFailure(`mfa:ip:${ip}`);
                await writeAuditLog(prisma, {
                    actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                    action: 'MFA_RECOVERY_FAILED',
                    entityType: 'MFA',
                    entityId: user.id,
                    success: false,
                    reasonCode: 'MFA_INVALID_RECOVERY_CODE',
                    metadata: { method: 'recovery_code' },
                });
                return NextResponse.json(
                    { error: 'Mã khôi phục không đúng hoặc đã được sử dụng', code: 'MFA_INVALID_RECOVERY_CODE' },
                    { status: 401 }
                );
            }

            // Atomic challenge claim: only winner issues MFA session
            const claimResult = await consumeMfaChallenge(challenge.jti);
            if (claimResult !== 'CLAIMED') {
                await writeAuditLog(prisma, {
                    actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                    action: 'MFA_RECOVERY_FAILED',
                    entityType: 'MFA',
                    entityId: user.id,
                    success: false,
                    reasonCode: 'MFA_CHALLENGE_REPLAY',
                });
                return NextResponse.json(
                    { error: 'Challenge đã được sử dụng hoặc hết hạn', code: 'MFA_CHALLENGE_REPLAY' },
                    { status: 401 }
                );
            }

            // Success: reset rate limits
            await recordMfaAttemptSuccess(`mfa:user:${user.id}`);
            await recordMfaAttemptSuccess(`mfa:ip:${ip}`);

            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'MFA_RECOVERY_SUCCESS',
                entityType: 'MFA',
                entityId: user.id,
                success: true,
                metadata: { method: 'recovery_code' },
            });

            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'LOGIN',
                entityType: 'AUTH',
                entityId: user.id,
                success: true,
            });

            const token = await signJWT({
                userId: user.id,
                role: user.role as (typeof UserRole)[keyof typeof UserRole],
                mfa: true,
            });
            const response = NextResponse.json({
                success: true,
                user: { id: user.id, username: user.username, name: user.name, role: user.role },
                method: 'recovery_code',
            });

            const isSecure = isSecureCookie(request);
            response.cookies.set(COOKIE_NAME, token, {
                httpOnly: true,
                secure: isSecure,
                sameSite: 'lax',
                path: '/',
                maxAge: MAX_AGE,
            });

            return response;
        }

        // TOTP verification path
        let secret: string;
        try {
            secret = decryptMfaSecret(user.mfaSecret);
        } catch (error) {
            logger.error('Failed to decrypt MFA secret:', error);
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                entityId: user.id,
                success: false,
                reasonCode: 'MFA_DECRYPTION_FAILED',
            });
            return NextResponse.json(
                { error: 'Lỗi giải mã khóa MFA hệ thống', code: 'MFA_DECRYPTION_FAILED' },
                { status: 500 }
            );
        }

        const validTotp = verifyTotp(code.trim(), secret, { window: 1 });
        if (!validTotp) {
            // Single authoritative failure record for bad TOTP
            await recordMfaAttemptFailure(`mfa:user:${user.id}`);
            await recordMfaAttemptFailure(`mfa:ip:${ip}`);
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                entityId: user.id,
                success: false,
                reasonCode: 'MFA_INVALID_TOKEN',
                metadata: { method: 'totp' },
            });
            return NextResponse.json(
                { error: 'Mã OTP không đúng hoặc đã hết hạn', code: 'MFA_INVALID_TOKEN' },
                { status: 401 }
            );
        }

        // Atomic challenge claim: only winner issues MFA session
        const claimResult = await consumeMfaChallenge(challenge.jti);
        if (claimResult !== 'CLAIMED') {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'MFA_VERIFY_FAILED',
                entityType: 'MFA',
                entityId: user.id,
                success: false,
                reasonCode: 'MFA_CHALLENGE_REPLAY',
            });
            return NextResponse.json(
                { error: 'Challenge đã được sử dụng hoặc hết hạn', code: 'MFA_CHALLENGE_REPLAY' },
                { status: 401 }
            );
        }

        // Success: reset rate limits
        await recordMfaAttemptSuccess(`mfa:user:${user.id}`);
        await recordMfaAttemptSuccess(`mfa:ip:${ip}`);

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
            action: 'MFA_VERIFY_SUCCESS',
            entityType: 'MFA',
            entityId: user.id,
            success: true,
            metadata: { method: 'totp' },
        });

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
            action: 'LOGIN',
            entityType: 'AUTH',
            entityId: user.id,
            success: true,
        });

        const token = await signJWT({
            userId: user.id,
            role: user.role as (typeof UserRole)[keyof typeof UserRole],
            mfa: true,
        });
        const response = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, name: user.name, role: user.role },
            method: 'totp',
        });

        const isSecure = isSecureCookie(request);
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            path: '/',
            maxAge: MAX_AGE,
        });

        return response;
    } catch (error) {
        logger.error('MFA verify route error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi trong quá trình xác thực MFA', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
