import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isSecureCookie } from '@/lib/cookie';

const COOKIE_NAME = 'auth_token';

export async function proxy(request: NextRequest) {
    logger.debug('[DEBUG] Proxy request:', request.nextUrl.pathname);
    const { pathname } = request.nextUrl;

    // =====================
    // 1. LOGIN PAGE: Nếu đã có token hợp lệ, redirect theo role
    // =====================
    if (pathname.startsWith('/login')) {
        const token = request.cookies.get(COOKIE_NAME)?.value;
        if (token) {
            const payload = await verifyJWT(token);
            if (payload) {
                const roleRedirect: Record<string, string> = {
                    ADMIN: '/admin',
                    STAFF: '/canbo',
                    KIOSK: '/kiosk',
                    DISPLAY: '/display',
                };
                const redirect = roleRedirect[payload.role];
                if (redirect) {
                    return NextResponse.redirect(new URL(redirect, request.url));
                }
            } else {
                const response = NextResponse.next();
                response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/', secure: isSecureCookie(request) });
                return response;
            }
        }
        return NextResponse.next();
    }

    // =====================
    // 2. PUBLIC ROUTES: Cho phép truy cập tự do
    // =====================
    const publicRoutes = ['/', '/get-ticket', '/track', '/waiting', '/demo', '/display', '/kiosk'];
    const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
    
    const PUBLIC_API_ROUTES = [
        '/api/auth',
        '/api/services',
        '/api/tickets',
        '/api/tickets/track',
        '/api/health',
        '/api/tts',
        '/api/sse',
        '/api/demo-token',
    ];
    const isPublicApiRoute = PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));

    if (pathname.startsWith('/_next/') || pathname.startsWith('/static/')) {
        return NextResponse.next();
    }

    if (isPublicRoute || isPublicApiRoute) {
        return NextResponse.next();
    }

    // =====================
    // 2b. /api/settings: GET public, mọi method khác (vd PUT) yêu cầu ADMIN
    // =====================
    if (pathname.startsWith('/api/settings')) {
        if (request.method === 'GET') {
            return NextResponse.next();
        }

        const token = request.cookies.get(COOKIE_NAME)?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
        }

        const payload = await verifyJWT(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
        }

        if (payload.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
        }

        return NextResponse.next();
    }

    // =====================
    // 2c. /api/themes: GET public (list preset + custom), ghi dữ liệu yêu cầu ADMIN
    // =====================
    if (pathname.startsWith('/api/themes')) {
        if (request.method === 'GET') {
            return NextResponse.next();
        }

        const token = request.cookies.get(COOKIE_NAME)?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
        }

        const payload = await verifyJWT(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
        }

        if (payload.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
        }

        return NextResponse.next();
    }

    // =====================
    // 3. PROTECTED ROUTES: Yêu cầu token hợp lệ + role-based access
    // =====================
    const protectedRoutes = [
        { prefix: '/admin', roles: ['ADMIN'] },
        { prefix: '/canbo', roles: ['STAFF', 'ADMIN'] },
        { prefix: '/api/admin', roles: ['ADMIN'] },
        { prefix: '/api/queue', roles: ['STAFF', 'ADMIN'] },
        { prefix: '/api/staff', roles: ['ADMIN'] },
        { prefix: '/api/stats', roles: ['ADMIN'] },
    ];

    const matchedRoute = protectedRoutes.find(route => pathname.startsWith(route.prefix));

    if (matchedRoute) {
        const token = request.cookies.get(COOKIE_NAME)?.value;
        if (!token) {
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }

        const payload = await verifyJWT(token);
        if (!payload) {
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
            }
            const response = NextResponse.redirect(new URL('/login', request.url));
            response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/', secure: isSecureCookie(request) });
            return response;
        }

        // Role-based access control
        if (!matchedRoute.roles.includes(payload.role)) {
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
            }
            const roleRedirect: Record<string, string> = {
                ADMIN: '/admin',
                STAFF: '/canbo',
                KIOSK: '/kiosk',
                DISPLAY: '/display',
            };
            const redirect = roleRedirect[payload.role] || '/login';
            return NextResponse.redirect(new URL(redirect, request.url));
        }

        return NextResponse.next();
    }

    // =====================
    // 4. DENY BY DEFAULT: Bất kỳ route /api nào không khớp whitelist hoặc protected đều bị chặn
    // =====================
    if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    return NextResponse.next();

}

export const config = {
    matcher: [
        '/login',
        '/admin/:path*',
        '/canbo/:path*',
        '/api/:path*',
    ],
};