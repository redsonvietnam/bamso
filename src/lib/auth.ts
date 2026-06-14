import { SignJWT, jwtVerify } from 'jose';
import { logger } from '@/lib/logger';

// --- JWT Utility ---
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET || 'your-default-fallback-jwt-secret-key-change-me-in-production';
    return new TextEncoder().encode(secret);
};

export async function signJWT(payload: { userId: string, role: string }): Promise<string> {
    const JWT_SECRET_BYTES = getJwtSecret();
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // 24 hours
        .sign(JWT_SECRET_BYTES);
}

export async function verifyJWT(token: string): Promise<{ userId: string, role: string } | null> {
    const JWT_SECRET_BYTES = getJwtSecret();
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET_BYTES, { algorithms: ['HS256'] });
        return payload as { userId: string, role: string };
    } catch (error) {
        logger.error('JWT verification failed:', error);
        return null;
    }
}
