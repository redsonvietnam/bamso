// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'test-admin', role: 'ADMIN' } })),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { DELETE, PUT } from '@/app/api/staff/route';

const PREFIX = 'core1_';
const SEED_ADMIN = { username: 'admin', name: 'Admin User', password: 'admin@2026' };

async function cleanupTestUsers() {
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
}

async function ensureSeedAdmin() {
    await prisma.user.upsert({
        where: { username: SEED_ADMIN.username },
        update: {
            passwordHash: hashPassword(SEED_ADMIN.password),
            name: SEED_ADMIN.name,
            role: 'ADMIN',
        },
        create: {
            username: SEED_ADMIN.username,
            passwordHash: hashPassword(SEED_ADMIN.password),
            name: SEED_ADMIN.name,
            role: 'ADMIN',
        },
    });
}

async function createAdmin(username: string) {
    return prisma.user.create({
        data: {
            username,
            passwordHash: hashPassword('TestPassword123'),
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
            passwordHash: hashPassword('TestPassword123'),
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

beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestUsers();
    await ensureSeedAdmin();
});

afterEach(async () => {
    await cleanupTestUsers();
    await ensureSeedAdmin();
});

describe('DELETE /api/staff last-admin invariant (CORE-01)', () => {
    it('concurrent delete of all admins leaves exactly one ADMIN with a deterministic rejection', async () => {
        const adminA = await createAdmin(`${PREFIX}admin_a`);
        const adminB = await createAdmin(`${PREFIX}admin_b`);
        const seed = await prisma.user.findUnique({
            where: { username: SEED_ADMIN.username },
            select: { id: true },
        });
        expect(seed).not.toBeNull();

        const foreignAdmins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true, username: true },
        });
        const foreign = foreignAdmins.filter(
            (u) => u.username !== SEED_ADMIN.username && !u.username.startsWith(PREFIX)
        );

        const results = await Promise.all([
            deleteRequest(seed!.id),
            deleteRequest(adminA.id),
            deleteRequest(adminB.id),
        ]);

        const successes = results.filter((r) => r.status === 200);
        const rejections = results.filter((r) => r.status === 400 && r.body.code === 'LAST_ADMIN');

        // No storage errors: every operation resolves to success or the stable business error.
        expect(successes.length + rejections.length).toBe(3);

        const remainingAdmins = await prisma.user.count({ where: { role: 'ADMIN' } });
        expect(remainingAdmins).toBeGreaterThanOrEqual(1);

        if (foreign.length === 0) {
            // Self-contained race: exactly one loser, exactly one survivor.
            expect(successes).toHaveLength(2);
            expect(rejections).toHaveLength(1);
            expect(remainingAdmins).toBe(1);
        }
    });

    it('sequential delete succeeds while other admins remain and removes the row', async () => {
        const adminA = await createAdmin(`${PREFIX}admin_seq`);
        // Seed is guaranteed present by beforeEach; other suites may hold
        // transient admins in parallel workers, so this test asserts only
        // what is deterministic regardless of foreign rows.
        const first = await deleteRequest(adminA.id);
        expect(first.status).toBe(200);
        expect(first.body.success).toBe(true);

        expect(await prisma.user.findUnique({ where: { id: adminA.id } })).toBeNull();
        expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBeGreaterThanOrEqual(1);
        const seedStillThere = await prisma.user.findUnique({ where: { username: SEED_ADMIN.username } });
        expect(seedStillThere).not.toBeNull();
    });
});

describe('PUT /api/staff name validation (CORE-02)', () => {
    it('rejects blank name', async () => {
        const staff = await createStaff(`${PREFIX}staff_blank`);
        const res = await putRequest({ id: staff.id, name: '' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');

        const unchanged = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(unchanged?.name).toBe('Original Name');
    });

    it('rejects whitespace-only name', async () => {
        const staff = await createStaff(`${PREFIX}staff_ws`);
        const res = await putRequest({ id: staff.id, name: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');

        const unchanged = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(unchanged?.name).toBe('Original Name');
    });

    it('preserves valid partial update', async () => {
        const staff = await createStaff(`${PREFIX}staff_partial`);
        const res = await putRequest({ id: staff.id, name: 'New Name' });
        expect(res.status).toBe(200);

        const updated = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(updated?.name).toBe('New Name');
        expect(updated?.username).toBe(`${PREFIX}staff_partial`);
        expect(updated?.role).toBe('STAFF');
    });
});
