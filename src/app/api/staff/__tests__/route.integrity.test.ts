// @vitest-environment node

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'test-admin', role: 'ADMIN' } })),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import type { PrismaClient } from '@prisma/client';

// Isolated SQLite file for the last-admin race: the singleton prisma client
// and the route handlers are imported dynamically AFTER DATABASE_URL points
// here, so this file never touches the shared dev database and can own the
// entire admin set deterministically. Production code is unchanged.
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const TEST_DB_PATH = path.resolve(process.cwd(), 'prisma', 'test-core1-race.db');
const TEST_DATABASE_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}?socket_timeout=5&connection_limit=1`;

// Mirrors the User model columns used by the staff routes. Fails loudly on
// drift; intentionally scoped to what these tests exercise.
const USER_DDL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "mfaEnabled" INTEGER NOT NULL DEFAULT 0,
  "mfaSecret" TEXT,
  "mfaKeyVersion" TEXT,
  "mfaEnabledAt" DATETIME,
  "enrollmentJti" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
`;

function removeTestDbFiles() {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try {
            fs.unlinkSync(`${TEST_DB_PATH}${suffix}`);
        } catch {
            // Missing file is the expected case.
        }
    }
}

let prisma!: PrismaClient;
let DELETE!: typeof import('@/app/api/staff/route').DELETE;
let PUT!: typeof import('@/app/api/staff/route').PUT;

async function createAdmin(username: string) {
    return prisma.user.create({
        data: {
            // Dummy hash: requireRole is mocked, so no password is verified.
            username,
            passwordHash: 'test-hash-not-verified',
            name: username,
            role: 'ADMIN',
        },
        select: { id: true, username: true },
    });
}

async function createStaff(username: string) {
    return prisma.user.create({
        data: {
            username,
            passwordHash: 'test-hash-not-verified',
            name: 'Original Name',
            role: 'STAFF',
        },
        select: { id: true, username: true },
    });
}

async function deleteRequest(id: string) {
    const res = await DELETE(new Request(`http://localhost/api/staff?id=${id}`));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function putRequest(payload: Record<string, unknown>) {
    const res = await PUT(
        new Request('http://localhost/api/staff', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
    removeTestDbFiles();
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    vi.resetModules();
    prisma = (await import('@/lib/db')).default;
    const route = await import('@/app/api/staff/route');
    DELETE = route.DELETE;
    PUT = route.PUT;
    await prisma.$executeRawUnsafe(USER_DDL);
}, 120000);

beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({});
});

afterEach(async () => {
    await prisma.user.deleteMany({});
});

afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    removeTestDbFiles();
});

describe('DELETE /api/staff last-admin invariant (CORE-01)', () => {
    it('concurrent delete of the only three admins leaves exactly one survivor', async () => {
        const t1 = await createAdmin('race_1');
        const t2 = await createAdmin('race_2');
        const t3 = await createAdmin('race_3');

        // Precondition: the test scope owns the entire admin universe —
        // isolated database, no seed, no foreign rows.
        expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(3);

        const results = await Promise.all([
            deleteRequest(t1.id),
            deleteRequest(t2.id),
            deleteRequest(t3.id),
        ]);

        const successes = results.filter((r) => r.status === 200);
        const rejections = results.filter((r) => r.status === 400 && r.body.code === 'LAST_ADMIN');

        // Exactly one winner, exactly one deterministic loser, no storage errors.
        expect(successes).toHaveLength(2);
        expect(rejections).toHaveLength(1);

        const remaining = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
        });
        expect(remaining).toHaveLength(1);
        expect([t1.id, t2.id, t3.id]).toContain(remaining[0]!.id);
    });

    it('sequential delete of the second-to-last admin succeeds, the last is rejected', async () => {
        const adminA = await createAdmin('seq_a');
        const adminB = await createAdmin('seq_b');

        const first = await deleteRequest(adminA.id);
        expect(first.status).toBe(200);
        expect(first.body.success).toBe(true);
        expect(await prisma.user.findUnique({ where: { id: adminA.id } })).toBeNull();

        const last = await deleteRequest(adminB.id);
        expect(last.status).toBe(400);
        expect(last.body.code).toBe('LAST_ADMIN');

        const remaining = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
        });
        expect(remaining).toHaveLength(1);
        expect(remaining[0]!.id).toBe(adminB.id);
    });
});

describe('PUT /api/staff name validation (CORE-02)', () => {
    it('rejects blank name', async () => {
        const staff = await createStaff('staff_blank');
        const res = await putRequest({ id: staff.id, name: '' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');

        const unchanged = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(unchanged?.name).toBe('Original Name');
    });

    it('rejects whitespace-only name', async () => {
        const staff = await createStaff('staff_ws');
        const res = await putRequest({ id: staff.id, name: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');

        const unchanged = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(unchanged?.name).toBe('Original Name');
    });

    it('preserves valid partial update', async () => {
        const staff = await createStaff('staff_partial');
        const res = await putRequest({ id: staff.id, name: 'New Name' });
        expect(res.status).toBe(200);

        const updated = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(updated?.name).toBe('New Name');
        expect(updated?.username).toBe('staff_partial');
        expect(updated?.role).toBe('STAFF');
    });
});
