/**
 * CORE-07: Production Timestamp Representation — CRITICAL FINDING
 *
 * Prisma stores DateTime in SQLite as EPOCH MILLISECONDS (integer),
 * NOT as ISO 8601 UTC-Z strings.
 *
 * Evidence:
 *   typeof(createdAt) = "integer"
 *   hex(createdAt)    = "31373839333535353336323935" (ASCII "1789355536295")
 *   Prisma client output → .toISOString() → "2026-09-14T02:47:36.063Z"
 *                         (deserialization converts epoch → Date → ISO string)
 *
 * Impact on purge:
 *   SQL "WHERE createdAt < '2025-09-13T17:00:00.000Z'"
 *   compares INTEGER 1789355536295 against TEXT '2025-09-...'
 *   SQLite rule: numeric is always less than non-numeric text
 *   Result: EVERY row is deleted regardless of actual date.
 *
 * This test PROVES the production invariant and documents the mismatch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const PY_PROOF = path.resolve(process.cwd(), 'scripts/__tests__/read_raw_sqlite.py');
const PY_CHECK = path.resolve(process.cwd(), 'scripts/__tests__/check_comparison.py');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

describe('CORE-07: Production timestamp representation proof', () => {
  let prisma: PrismaClient;
  let createdId: string;
  let prismaClientTimestamp: string; // what Prisma client returns (.toISOString())

  beforeAll(async () => {
    const mod = await import('@/lib/db');
    prisma = mod.default;
  });

  afterAll(async () => {
    if (prisma && createdId) {
      await prisma.auditLog.delete({ where: { id: createdId } }).catch(() => {});
    }
    if (prisma) await prisma.$disconnect();
  });

  it('1. Prisma creates AuditLog and returns ISO string via client', async () => {
    const record = await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'LOGIN',
        entityType: 'AUTH',
        success: true,
        metadata: JSON.stringify({ proof: 'CORE-07-representation-invariant' }),
      },
    });
    createdId = record.id;
    prismaClientTimestamp = record.createdAt instanceof Date
      ? record.createdAt.toISOString()
      : String(record.createdAt);

    expect(prismaClientTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('2. raw SQLite typeof(createdAt) = int (not text)', () => {
    const output = execSync(`python "${PY_PROOF}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toContain('RAW_TYPE: int');
  });

  it('3. raw SQLite hex confirms epoch ms digits, not ISO string', () => {
    // hex starts with 31 (ASCII '1') = epoch ms integer
    // An ISO string like "2026-09-14..." would start with hex 32303236... (ASCII "2026")
    const output = execSync(`python "${PY_PROOF}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toMatch(/RAW_HEX: 31\d+/);
  });

  it('4. CRITICAL: ISO cutoff comparison deletes ALL rows (bug)', () => {
    // The purge script constructs cutoff as ISO 8601: "2025-09-13T17:00:00.000Z"
    // But stored values are epoch ms integers.
    // SQLite rule: numeric < non-numeric-text → ALWAYS TRUE
    // This means the purge would delete EVERY row, not just old ones.
    const output = execSync(`python "${PY_CHECK}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
    });
    // ISO string cutoff incorrectly deletes ALL rows (4 = all AuditLog rows)
    expect(output).toContain("Purge with ISO cutoff '2025-09-13T17:00:00.000Z': would delete 4 rows");
  });

  it('5. epoch ms cutoff comparison correctly deletes 0 rows', () => {
    const output = execSync(`python "${PY_CHECK}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
    });
    // Epoch ms cutoff correctly keeps recent rows
    expect(output).toContain("Purge with epoch cutoff 1757786400000: would delete 0 rows");
  });

  it('6. representation invariant: Prisma DateTime → epoch ms INTEGER in SQLite', () => {
    // This is the production invariant.
    // Prisma Client: new Date().toISOString() → "2026-09-14T02:47:36.063Z"
    // Prisma Query Engine → SQLite: stores as INTEGER 1789355536295
    // Deserialization: INTEGER → Date → .toISOString() → "2026-09-14T02:47:36.063Z"
    //
    // The ISO string is a CLIENT-SIDE serialization, NOT the on-disk format.
    expect(prismaClientTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // But the actual SQLite value is an integer (proved by step 2-3)
    // Therefore: the purge must compare as EPOCH MS, not ISO text.
  });
});
