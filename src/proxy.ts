import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';

const COOKIE_NAME = 'auth_token';

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isLoginPage = pathname.startsWith('/login');

    // Handle /login redirect if user is already logged in
    if (isLoginPage) {
        const token = request.cookies.get(COOKIE_NAME)?.value;
        if (token) {
            const payload = await verifyJWT(token);
            if (payload) {
                if (payload.role === 'ADMIN') {
                    return NextResponse.redirect(new URL('/admin', request.url));
                }
                if (payload.role === 'STAFF') {
                    return NextResponse.redirect(new URL('/canbo', request.url));
                }
                if (payload.role === 'KIOSK') {
                    return NextResponse.redirect(new URL('/kiosk', request.url));
                }
                if (payload.role === 'DISPLAY') {
                    return NextResponse.redirect(new URL('/display', request.url));
                }
            }
        }
        return NextResponse.next();
    }

    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    const isStaffRoute = pathname.startsWith('/canbo') || pathname.startsWith('/api/queue');

    // Allow non-protected routes
    if (!isAdminRoute && !isStaffRoute) {
        return NextResponse.next();
    }

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

    const role = payload.role;

    // Authorization checks
    if (isAdminRoute && role !== 'ADMIN') {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
        }
        if (role === 'STAFF') {
            return NextResponse.redirect(new URL('/canbo', request.url));
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isStaffRoute && role !== 'STAFF' && role !== 'ADMIN') {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/admin/:path*',
        '/canbo/:path*',
        '/api/admin/:path*',
        '/api/queue/:path*',
        '/login',
    ],
};
