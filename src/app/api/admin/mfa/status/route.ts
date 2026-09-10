import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const auth = await requireRole(UserRole.ADMIN);
        if ('error' in auth) return auth.error;

        const user = await prisma.user.findUnique({
            where: { id: auth.payload.userId },
            select: { id: true, mfaEnabled: true, mfaEnabledAt: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
        }

        let remainingRecoveryCodes = 0;
        if (user.mfaEnabled) {
            remainingRecoveryCodes = await prisma.recoveryCode.count({
                where: {
                    userId: user.id,
                    usedAt: null,
                },
            });
        }

        return NextResponse.json({
            mfaEnabled: user.mfaEnabled,
            mfaEnabledAt: user.mfaEnabledAt,
            remainingRecoveryCodes,
        });
    } catch (error) {
        logger.error('MFA status route error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
