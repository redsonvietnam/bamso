import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import prisma from '@/lib/db';

const COOKIE_NAME = 'auth_token';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const payload = await verifyJWT(token);

        if (!payload || !payload.userId) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, username: true, name: true, role: true },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found', code: 'USER_NOT_FOUND' },
                { status: 401 }
            );
        }

        return NextResponse.json(user);
    } catch (error) {
        console.error('Fetch me error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
