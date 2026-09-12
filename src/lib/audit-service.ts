import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';

export type AuditActorType = 'USER' | 'ANONYMOUS' | 'SYSTEM';
export type AuditAction =
    | 'LOGIN' | 'TICKET_CREATED' | 'CALL_NEXT' | 'SKIP' | 'COMPLETE' | 'RESTORE'
    | 'MFA_ENROLL_STARTED' | 'MFA_ENROLL_COMPLETED' | 'MFA_VERIFY_SUCCESS' | 'MFA_VERIFY_FAILED'
    | 'MFA_RECOVERY_SUCCESS' | 'MFA_RECOVERY_FAILED' | 'MFA_DISABLED' | 'MFA_RESET'
    | 'MFA_BACKUP_CODES_REGENERATED';

export type AuditEntityType = 'AUTH' | 'TICKET' | 'MFA' | 'USER';

export const AUDIT_REASON_CODES = [
    'INVALID_CREDENTIALS', 'MISSING_CREDENTIALS', 'RATE_LIMITED', 'SERVER_ERROR', 'INTERNAL_ERROR',
    'CLIENT_ERROR', 'INVALID_FIELDS', 'FIELD_TOO_LONG', 'SERVICE_INACTIVE', 'NO_PENDING_TICKETS',
    'INVALID_STATUS', 'NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'CALL_FAILED', 'CONCURRENCY_CONFLICT',
    'MFA_REQUIRED', 'MFA_INVALID_TOKEN', 'MFA_RATE_LIMITED', 'MFA_NOT_ENABLED', 'MFA_ALREADY_ENABLED',
    'MFA_INVALID_RECOVERY_CODE', 'MFA_DECRYPTION_FAILED', 'MFA_CHALLENGE_REPLAY', 'MFA_ENROLLMENT_REPLAY',
    'MFA_ENROLLMENT_STALE', 'MFA_ENROLLMENT_STORAGE_ERROR', 'MFA_REGEN_STORAGE_ERROR',
    'MFA_DISABLED_CONCURRENT', 'MFA_REGEN_CONCURRENT',
] as const;

export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[number];

export interface AuditActor { actorType: AuditActorType; actorId?: string | null; actorRole?: string | null; }

export interface AuditMetadata {
    counter?: string;
    autoCompletedTicketId?: string;
    method?: string;
    enrollmentJti?: string;
    fenceToken?: string;
}

export interface AuditLogInput {
    actor: AuditActor;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId?: string | null;
    success: boolean;
    reasonCode?: AuditReasonCode | null;
    metadata?: AuditMetadata | null;
}

type DbClient = Prisma.TransactionClient | typeof prisma;
const ALLOWED_METADATA_KEYS = new Set(['counter', 'autoCompletedTicketId', 'method', 'enrollmentJti', 'fenceToken']);
const MAX_METADATA_LENGTH = 500;
const VALID_REASON_CODES = new Set<string>(AUDIT_REASON_CODES);

function sanitizeMetadata(metadata?: AuditMetadata | null): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const sanitized: Record<string, string> = {};
    for (const [key, val] of Object.entries(metadata)) {
        if (ALLOWED_METADATA_KEYS.has(key) && typeof val === 'string' && val.length > 0) sanitized[key] = val.slice(0, 100);
    }
    if (Object.keys(sanitized).length === 0) return null;
    const json = JSON.stringify(sanitized);
    return json.length <= MAX_METADATA_LENGTH ? json : null;
}

export async function writeAuditLog(db: DbClient, input: AuditLogInput) {
    if (!db || !('auditLog' in db) || typeof (db as unknown as { auditLog?: { create?: unknown } }).auditLog?.create !== 'function') return null;
    if (input.reasonCode !== undefined && input.reasonCode !== null && !VALID_REASON_CODES.has(input.reasonCode)) {
        throw new Error(`Invalid audit reasonCode: ${input.reasonCode}`);
    }
    const sanitizedMetadata = sanitizeMetadata(input.metadata);
    return db.auditLog.create({
        data: {
            actorType: input.actor.actorType,
            actorId: input.actor.actorId ?? null,
            actorRole: input.actor.actorRole ?? null,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            success: input.success,
            reasonCode: input.reasonCode ?? null,
            metadata: sanitizedMetadata,
        },
    });
}

export async function purgeAuditLogs(options?: { olderThanDays?: number; db?: DbClient }) {
    const days = options?.olderThanDays ?? 365;
    const client = options?.db ?? prisma;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await client.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { deletedCount: result.count, cutoff, retentionDays: days };
}
