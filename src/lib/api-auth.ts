import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { UserRole } from '@/lib/constants';

const COOKIE_NAME = 'auth_token';

type Role = (typeof UserRole)[keyof typeof UserRole];

/**
 * Authenticate the request from the auth_token cookie.
 * Returns the JWT payload if valid, or a NextResponse error if not.
 */
export async function authenticate() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
        return {
            error: NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            ),
        };
    }

    const payload = await verifyJWT(token);

    if (!payload || !payload.userId) {
        return {
            error: NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            ),
        };
    }

    return { payload };
}

/**
 * Authenticate and verify the user has one of the allowed roles.
 */
export async function requireRole(...allowedRoles: Role[]) {
    const result = await authenticate();

    if ('error' in result) {
        return result;
    }

    if (!allowedRoles.includes(result.payload.role as Role)) {
        return {
            error: NextResponse.json(
                { error: 'Forbidden', code: 'FORBIDDEN' },
                { status: 403 }
            ),
        };
    }

    return result;
}