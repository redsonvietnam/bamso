import { NextResponse } from 'next/server';
import { signJWT } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const role = searchParams.get('role') || 'STAFF';

        const demoPayloads: Record<string, { userId: string; role: string }> = {
            ADMIN: { userId: 'demo-admin', role: 'ADMIN' },
            STAFF: { userId: 'demo-staff', role: 'STAFF' },
            KIOSK: { userId: 'demo-kiosk', role: 'KIOSK' },
            DISPLAY: { userId: 'demo-display', role: 'DISPLAY' },
        };

        const payload = demoPayloads[role] || demoPayloads.STAFF;
        const token = await signJWT(payload);

        const response = NextResponse.json({ token, role });
        response.cookies.set('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60, // 1 hour
        });

        return response;
    } catch (error) {
        console.error('Demo token error:', error);
        return NextResponse.json(
            { error: 'Lỗi tạo demo token', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
