import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
    writeAuditLog,
    purgeAuditLogs,
    AuditActor,
    AuditLogInput,
} from '@/lib/audit-service';
import { createTicket } from '@/lib/ticket-service';
import {
    callNextTicket,
    completeTicket,
    skipTicket,
    restoreTicket,
} from '@/lib/queue-service';
import { TicketStatus } from '@/lib/constants';

describe('Audit Logging System (WS-BAMSO-AUDIT-LOGGING-01)', () => {
    let testServiceId: string;

    beforeEach(async () => {
        // Clear audit logs and tickets created during tests
        await prisma.auditLog.deleteMany({});
        await prisma.ticket.deleteMany({});

        // Ensure at least one active test service exists
        const service = await prisma.service.upsert({
            where: { code: 'AUDIT_SVC' },
            update: { isActive: true },
            create: {
                code: 'AUDIT_SVC',
                name: 'Audit Test Service',
                prefix: 'A',
                color: '#10B981',
                order: 1,
                isActive: true,
            },
        });
        testServiceId = service.id;
    });

    describe('Audit Helper & Metadata Sanitization', () => {
        it('writes typed audit record and ignores non-allowlisted metadata', async () => {
            const actor: AuditActor = {
                actorType: 'USER',
                actorId: 'usr-123',
                actorRole: 'STAFF',
            };

            const input: AuditLogInput = {
                actor,
                action: 'CALL_NEXT',
                entityType: 'TICKET',
                entityId: 't-1',
                success: true,
                metadata: {
                    counter: 'Quầy 1',
                    autoCompletedTicketId: 't-prev',
                    // @ts-expect-error testing arbitrary non-whitelisted key rejection
                    unauthorizedKey: 'secret-token-123',
                },
            };

            const record = await writeAuditLog(prisma, input);
            expect(record).not.toBeNull();
            expect(record?.actorType).toBe('USER');
            expect(record?.actorId).toBe('usr-123');
            expect(record?.actorRole).toBe('STAFF');
            expect(record?.action).toBe('CALL_NEXT');
            expect(record?.entityType).toBe('TICKET');
            expect(record?.entityId).toBe('t-1');
            expect(record?.success).toBe(true);

            // Metadata must only contain allowed keys
            const parsedMeta = JSON.parse(record!.metadata!);
            expect(parsedMeta).toEqual({
                counter: 'Quầy 1',
                autoCompletedTicketId: 't-prev',
            });
            expect(parsedMeta.unauthorizedKey).toBeUndefined();
        });

        it('handles null/empty metadata cleanly', async () => {
            const record = await writeAuditLog(prisma, {
                actor: { actorType: 'ANONYMOUS' },
                action: 'TICKET_CREATED',
                entityType: 'TICKET',
                entityId: 't-2',
                success: true,
            });

            expect(record?.metadata).toBeNull();
        });
    });

    describe('TICKET_CREATED Atomic Audit', () => {
        it('creates ticket and writes TICKET_CREATED audit atomically with anonymous actor', async () => {
            const ticket = await createTicket({
                serviceId: testServiceId,
                customerName: 'Nguyen Van A',
                phone: '0901234567',
            });

            expect(ticket).toBeDefined();

            const logs = await prisma.auditLog.findMany({
                where: { entityId: ticket.id },
            });

            expect(logs).toHaveLength(1);
            const log = logs[0];
            expect(log.action).toBe('TICKET_CREATED');
            expect(log.entityType).toBe('TICKET');
            expect(log.actorType).toBe('ANONYMOUS');
            expect(log.actorId).toBeNull();
            expect(log.actorRole).toBeNull();
            expect(log.success).toBe(true);
            expect(log.metadata).toBeNull();

            // PII Verification: metadata & audit record must not leak customerName or phone
            expect(JSON.stringify(log)).not.toContain('Nguyen Van A');
            expect(JSON.stringify(log)).not.toContain('0901234567');
        });
    });

    describe('CALL_NEXT Atomic Audit & Special Rule', () => {
        it('writes CALL_NEXT inside transaction with actor and counter metadata', async () => {
            const ticket = await createTicket({ serviceId: testServiceId });

            const staffActor: AuditActor = {
                actorType: 'USER',
                actorId: 'staff-uuid-1',
                actorRole: 'STAFF',
            };

            const called = await callNextTicket(testServiceId, 'Quầy 1', staffActor);
            expect(called).toBeDefined();
            expect(called?.id).toBe(ticket.id);

            const audit = await prisma.auditLog.findFirst({
                where: {
                    action: 'CALL_NEXT',
                    entityId: ticket.id,
                },
            });

            expect(audit).not.toBeNull();
            expect(audit?.actorType).toBe('USER');
            expect(audit?.actorId).toBe('staff-uuid-1');
            expect(audit?.actorRole).toBe('STAFF');
            expect(audit?.success).toBe(true);

            const meta = JSON.parse(audit!.metadata!);
            expect(meta).toEqual({ counter: 'Quầy 1' });
        });

        it('records autoCompletedTicketId in metadata and DOES NOT emit separate COMPLETE event on auto-complete', async () => {
            // First ticket: called at Quầy 1
            const ticket1 = await createTicket({ serviceId: testServiceId });
            const ticket2 = await createTicket({ serviceId: testServiceId });

            const staffActor: AuditActor = {
                actorType: 'USER',
                actorId: 'staff-uuid-1',
                actorRole: 'STAFF',
            };

            await callNextTicket(testServiceId, 'Quầy 1', staffActor);

            // Clear audit log from ticket1 call
            await prisma.auditLog.deleteMany({});

            // Calling next will auto-complete ticket1 at Quầy 1 and claim ticket2
            const called2 = await callNextTicket(testServiceId, 'Quầy 1', staffActor);
            expect(called2?.id).toBe(ticket2.id);

            // Verify ticket1 status is completed
            const updated1 = await prisma.ticket.findUnique({ where: { id: ticket1.id } });
            expect(updated1?.status).toBe(TicketStatus.COMPLETED);

            // Audit verification
            const logs = await prisma.auditLog.findMany();
            expect(logs).toHaveLength(1); // Only ONE audit log emitted

            const callNextLog = logs[0];
            expect(callNextLog.action).toBe('CALL_NEXT');
            expect(callNextLog.entityId).toBe(ticket2.id);

            const meta = JSON.parse(callNextLog.metadata!);
            expect(meta).toEqual({
                counter: 'Quầy 1',
                autoCompletedTicketId: ticket1.id,
            });

            // Crucial assertion: no separate COMPLETE action logged
            const completeLogs = await prisma.auditLog.findMany({
                where: { action: 'COMPLETE' },
            });
            expect(completeLogs).toHaveLength(0);
        });
    });

    describe('COMPLETE, SKIP, RESTORE Atomic Audits', () => {
        it('writes COMPLETE audit atomically inside completeTicket transaction', async () => {
            const ticket = await createTicket({ serviceId: testServiceId });
            await callNextTicket(testServiceId, 'Quầy 2');

            await prisma.auditLog.deleteMany({});

            const staffActor: AuditActor = {
                actorType: 'USER',
                actorId: 'staff-uuid-2',
                actorRole: 'STAFF',
            };

            const completed = await completeTicket(ticket.id, staffActor);
            expect(completed?.status).toBe(TicketStatus.COMPLETED);

            const log = await prisma.auditLog.findFirst({
                where: { action: 'COMPLETE', entityId: ticket.id },
            });

            expect(log).not.toBeNull();
            expect(log?.actorType).toBe('USER');
            expect(log?.actorId).toBe('staff-uuid-2');
            expect(log?.success).toBe(true);
        });

        it('writes SKIP audit atomically inside skipTicket transaction', async () => {
            const ticket = await createTicket({ serviceId: testServiceId });
            await callNextTicket(testServiceId, 'Quầy 3');

            await prisma.auditLog.deleteMany({});

            const staffActor: AuditActor = {
                actorType: 'USER',
                actorId: 'staff-uuid-3',
                actorRole: 'STAFF',
            };

            const skipped = await skipTicket(ticket.id, staffActor);
            expect(skipped).toBeDefined();

            const log = await prisma.auditLog.findFirst({
                where: { action: 'SKIP', entityId: ticket.id },
            });

            expect(log).not.toBeNull();
            expect(log?.actorType).toBe('USER');
            expect(log?.actorId).toBe('staff-uuid-3');
            expect(log?.success).toBe(true);
        });

        it('writes RESTORE audit atomically inside restoreTicket transaction', async () => {
            const ticket = await createTicket({ serviceId: testServiceId });
            await callNextTicket(testServiceId, 'Quầy 3');

            // Force ticket to MISSED
            await prisma.ticket.update({
                where: { id: ticket.id },
                data: { status: TicketStatus.MISSED },
            });

            await prisma.auditLog.deleteMany({});

            const staffActor: AuditActor = {
                actorType: 'USER',
                actorId: 'staff-uuid-4',
                actorRole: 'STAFF',
            };

            const restored = await restoreTicket(ticket.id, staffActor);
            expect(restored?.status).toBe(TicketStatus.PENDING);

            const log = await prisma.auditLog.findFirst({
                where: { action: 'RESTORE', entityId: ticket.id },
            });

            expect(log).not.toBeNull();
            expect(log?.actorType).toBe('USER');
            expect(log?.actorId).toBe('staff-uuid-4');
            expect(log?.success).toBe(true);
        });
    });

    describe('Transaction Rollback Atomicity', () => {
        it('rolls back audit log if transaction aborts', async () => {
            await expect(
                prisma.$transaction(async (tx) => {
                    await writeAuditLog(tx, {
                        actor: { actorType: 'SYSTEM' },
                        action: 'TICKET_CREATED',
                        entityType: 'TICKET',
                        entityId: 'fake-id',
                        success: true,
                    });

                    // Intentional error to force rollback
                    throw new Error('Forced rollback');
                })
            ).rejects.toThrow('Forced rollback');

            const count = await prisma.auditLog.count({
                where: { entityId: 'fake-id' },
            });
            expect(count).toBe(0);
        });
    });

    describe('365-Day Retention Purge', () => {
        it('purges logs older than cutoff and retains recent logs', async () => {
            const now = new Date();
            const oldDate = new Date();
            oldDate.setDate(now.getDate() - 400); // 400 days old

            // Insert old record directly
            await prisma.auditLog.create({
                data: {
                    actorType: 'SYSTEM',
                    action: 'LOGIN',
                    entityType: 'AUTH',
                    success: true,
                    createdAt: oldDate,
                },
            });

            // Insert recent record
            await prisma.auditLog.create({
                data: {
                    actorType: 'SYSTEM',
                    action: 'LOGIN',
                    entityType: 'AUTH',
                    success: true,
                    createdAt: now,
                },
            });

            const initialCount = await prisma.auditLog.count();
            expect(initialCount).toBe(2);

            // Execute 365-day purge
            const result = await purgeAuditLogs({ olderThanDays: 365 });
            expect(result.deletedCount).toBe(1);

            const remaining = await prisma.auditLog.findMany();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].createdAt.getTime()).toBeCloseTo(now.getTime(), -3);
        });
    });

    describe('PII & Secret Minimization', () => {
        it('proves no sensitive tokens, passwords, or customer PII in audit table', async () => {
            // Create a ticket with full customer info
            const ticket = await createTicket({
                serviceId: testServiceId,
                customerName: 'Trần Thị B',
                phone: '0987654321',
            });

            // Call it and complete it
            await callNextTicket(testServiceId, 'Quầy 1');
            await completeTicket(ticket.id);

            // Fetch all audit rows
            const logs = await prisma.auditLog.findMany();
            expect(logs.length).toBeGreaterThanOrEqual(3);

            const allSerialized = JSON.stringify(logs);

            // Strictly forbidden strings
            const forbidden = [
                'Trần Thị B',
                '0987654321',
                'password',
                'passwordHash',
                'auth_token',
                'Bearer',
                'Authorization',
                'JWT',
            ];

            for (const item of forbidden) {
                expect(allSerialized).not.toContain(item);
            }
        });
    });
});
