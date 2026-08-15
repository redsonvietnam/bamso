import { SignJWT, jwtVerify } from 'jose';
import { logger } from '@/lib/logger';
import { UserRole, type UserRole as UserRoleType } from '@/lib/constants';

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required. Generate one with: openssl rand -base64 48');
    }
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    // Normalize into the current runtime's Uint8Array realm. This avoids
    // cross-realm TypedArray failures under jsdom/Vitest while remaining
    // compatible with jose's Node and Web Crypto key handling.
    return Uint8Array.from(new TextEncoder().encode(secret));
};

function isUserRole(value: unknown): value is UserRoleType {
    return typeof value === 'string' && Object.values(UserRole).includes(value as UserRoleType);
}

export async function signJWT(payload: { userId: string, role: UserRoleType }): Promise<string> {
    const JWT_SECRET_BYTES = getJwtSecret();
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(JWT_SECRET_BYTES);
}

export async function verifyJWT(token: string): Promise<{ userId: string, role: UserRoleType } | null> {
    const JWT_SECRET_BYTES = getJwtSecret();
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET_BYTES, { algorithms: ['HS256'] });
        if (typeof payload.userId !== 'string' || payload.userId.length === 0 || !isUserRole(payload.role)) {
            return null;
        }
        return { userId: payload.userId, role: payload.role };
    } catch (error) {
        logger.error('JWT verification failed:', error);
        return null;
    }
}