import { NextResponse } from 'next/server';

const COOKIE_NAME = 'auth_token';

export async function POST() {
    const response = NextResponse.json({
        success: true,
        message: 'Đăng xuất thành công'
    });

    // Clear httpOnly cookie natively
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0, // Expires immediately
    });

    return response;
}
