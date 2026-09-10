import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signJWT, isUserRole } from '@/lib/auth';
import { verifyPassword, hashPassword, needsRehash } from '@/lib/password';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { isSecureCookie } from '@/lib/cookie';
import { writeAuditLog } from '@/lib/audit-service';
import { createMfaChallengeToken } from '@/lib/mfa-service';

const COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24;

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        const { allowed } = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
        if (!allowed) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'LOGIN',
                entityType: 'AUTH',
                success: false,
                reasonCode: 'RATE_LIMITED',
            });
            return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
        }

        const { username, password } = await request.json();

        if (!username || !password) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'LOGIN',
                entityType: 'AUTH',
                success: false,
                reasonCode: 'MISSING_CREDENTIALS',
            });
            return NextResponse.json(
                { error: 'Tên đăng nhập và mật khẩu là bắt buộc', code: 'MISSING_CREDENTIALS' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { username },
            select: { id: true, username: true, name: true, role: true, passwordHash: true, mfaEnabled: true },
        });

        if (!user || !verifyPassword(password, user.passwordHash)) {
            await writeAuditLog(prisma, {
                actor: user
                    ? { actorType: 'USER', actorId: user.id, actorRole: user.role }
                    : { actorType: 'ANONYMOUS' },
                action: 'LOGIN',
                entityType: 'AUTH',
                entityId: user?.id ?? null,
                success: false,
                reasonCode: 'INVALID_CREDENTIALS',
            });
            return NextResponse.json(
                { error: 'Tên đăng nhập hoặc mật khẩu không đúng', code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        // Auto-rehash password if it was created with weak iterations
        if (needsRehash(user.passwordHash)) {
            const newHash = hashPassword(password);
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: newHash },
            });
            logger.log(`Auto-rehashed password for user: ${user.username}`);
        }

        if (!isUserRole(user.role)) {
            await writeAuditLog(prisma, {
                actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
                action: 'LOGIN',
                entityType: 'AUTH',
                entityId: user.id,
                success: false,
                reasonCode: 'SERVER_ERROR',
            });
            return NextResponse.json(
                { error: 'Đã xảy ra lỗi trong quá trình đăng nhập', code: 'SERVER_ERROR' },
                { status: 500 }
            );
        }

        // Invariant 1: MFA-enabled ADMIN must satisfy MFA challenge before receiving an authenticated session
        if (user.role === 'ADMIN' && user.mfaEnabled) {
            const challengeToken = await createMfaChallengeToken(user.id, user.role);
            return NextResponse.json({
                mfaRequired: true,
                challengeToken,
            });
        }

        await writeAuditLog(prisma, {
            actor: { actorType: 'USER', actorId: user.id, actorRole: user.role },
            action: 'LOGIN',
            entityType: 'AUTH',
            entityId: user.id,
            success: true,
        });

        const token = await signJWT({ userId: user.id, role: user.role });

        const response = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, name: user.name, role: user.role }
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
        logger.error('Login error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi trong quá trình đăng nhập', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
