import { NextRequest, NextResponse } from 'next/server';
import { isSecureCookie } from '@/lib/cookie';

const COOKIE_NAME = 'auth_token';

export async function POST(request: NextRequest) {
    const response = NextResponse.json({
        success: true,
        message: 'Đăng xuất thành công'
    });

    // Clear httpOnly cookie natively
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: isSecureCookie(request),
        sameSite: 'lax',
        path: '/',
        maxAge: 0, // Expires immediately
    });

    return response;
}
