import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'auth_token';

export async function POST(request: NextRequest) {
    const response = NextResponse.json({
        success: true,
        message: 'Đăng xuất thành công'
    });

    // Clear httpOnly cookie natively
    const isSecure = process.env.NODE_ENV === 'production' && request.headers.get('x-forwarded-proto') === 'https';
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0, // Expires immediately
    });

    return response;
}
