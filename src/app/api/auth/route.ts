import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signJWT } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';

const COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24; // 24 hours

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: 'Tên đăng nhập và mật khẩu là bắt buộc', code: 'MISSING_CREDENTIALS' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { username },
            select: { id: true, name: true, role: true, passwordHash: true },
        });

        if (!user || !verifyPassword(password, user.passwordHash)) {
            return NextResponse.json(
                { error: 'Tên đăng nhập hoặc mật khẩu không đúng', code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        // Sign JWT
        const token = await signJWT({ userId: user.id, role: user.role });

        const response = NextResponse.json({
            success: true,
            user: { name: user.name, role: user.role }
        });

        // Set httpOnly cookie natively
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: MAX_AGE,
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Đã xảy ra lỗi trong quá trình đăng nhập', code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
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
