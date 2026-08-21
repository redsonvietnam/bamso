import { NextResponse } from 'next/server';
import { signJWT } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isSecureCookie } from '@/lib/cookie';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';
import type { UserRole } from '@/lib/constants';

const DEMO_ALLOWED_ROLES = ['STAFF', 'KIOSK', 'DISPLAY'] as const;

export async function GET(request: Request) {
    // Block entirely unless DEMO_MODE_ENABLED=true
    if (process.env.DEMO_MODE_ENABLED !== 'true') {
        return NextResponse.json(
            { error: 'Demo mode is not enabled', code: 'FORBIDDEN' },
            { status: 403 }
        );
    }

    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`demo-token:${ip}`, RATE_LIMITS.demoToken);
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const requestedRole = (searchParams.get('role') || 'STAFF').toUpperCase();

        // NEVER allow ADMIN role through demo-token, even if DEMO_MODE_ENABLED
        const role = DEMO_ALLOWED_ROLES.includes(requestedRole as typeof DEMO_ALLOWED_ROLES[number])
            ? requestedRole
            : 'STAFF';

        const demoPayloads: Record<string, { userId: string; role: UserRole }> = {
            STAFF: { userId: 'demo-staff', role: 'STAFF' },
            KIOSK: { userId: 'demo-kiosk', role: 'KIOSK' },
            DISPLAY: { userId: 'demo-display', role: 'DISPLAY' },
        };

        const payload = demoPayloads[role];
        const token = await signJWT(payload);

        const response = NextResponse.json({ token, role });
        response.cookies.set('auth_token', token, {
            httpOnly: true,
            secure: isSecureCookie(request),
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60,
        });

        return response;
    } catch (error) {
        logger.error('Demo token error:', error);
        return NextResponse.json(
            { error: 'Lỗi tạo demo token', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
