import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        // Perform a simple query to check database connectivity
        // This is more robust than just prisma.$connect() in a serverless context
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ ok: true, db: 'connected' });
    } catch (error) {
        logger.error('Database connection failed:', error);
        // Return a 500 status code if the database connection fails
        return NextResponse.json({ ok: false, db: 'disconnected', error: (error as Error).message }, { status: 500 });
    }
}
