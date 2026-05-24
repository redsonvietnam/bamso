import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';

const COOKIE_NAME = 'auth_token';

export async function proxy(request: NextRequest) {
    console.log('[DEBUG] Proxy request:', request.nextUrl.pathname);
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
                response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
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
    const isPublicApiRoute = pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/services') ||
        pathname.startsWith('/api/tickets') ||
        pathname.startsWith('/api/tickets/track') ||
        pathname.startsWith('/api/settings') ||
        pathname.startsWith('/api/health') ||
        pathname.startsWith('/api/tts') ||
        pathname.startsWith('/api/sse') ||
        pathname.startsWith('/api/demo-token');

        if (pathname.startsWith('/_next/') || pathname.startsWith('/static/')) {
        return NextResponse.next();
    }
    if (isPublicRoute || isPublicApiRoute) {
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
            response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
            return response;
        }

        // Role-based access control
        if (!matchedRoute.roles.includes(payload.role)) {
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
            }
            // Redirect user to their appropriate dashboard
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

    // Default: allow through
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/login',
        '/admin/:path*',
        '/canbo/:path*',
        '/api/admin/:path*',
        '/api/queue/:path*',
        '/api/staff/:path*',
        '/api/stats/:path*',
    ],
};