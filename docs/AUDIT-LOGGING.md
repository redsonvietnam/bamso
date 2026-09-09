# Domain Audit Logging

> Technical reference for BAMSO durable domain audit trail.
> Workstream: `WS-BAMSO-AUDIT-LOGGING-01`.

---

## 1. Overview

BAMSO implements a minimal, durable domain audit log stored directly in SQLite table `AuditLog`. It records business-critical authentication and queue state transitions atomically within the same database transaction as the business mutation.

---

## 2. Event Scope

The audit trail covers six domain actions:

| Action | Entity | Actor | Atomic with Mutation | Description |
|---|---|---|---|---|
| `LOGIN` | `AUTH` | `USER` / `ANONYMOUS` | Sequential | Successful login or authentication failure |
| `TICKET_CREATED` | `TICKET` | `ANONYMOUS` | **Yes (in tx)** | New ticket issued |
| `CALL_NEXT` | `TICKET` | `USER` | **Yes (in tx)** | Counter claims next ticket |
| `SKIP` | `TICKET` | `USER` | **Yes (in tx)** | Ticket skipped (repositioned or missed) |
| `COMPLETE` | `TICKET` | `USER` | **Yes (in tx)** | Ticket marked completed |
| `RESTORE` | `TICKET` | `USER` | **Yes (in tx)** | Missed ticket restored to queue |

### Finite Reason Codes
Failures record a bounded reason code strictly validated at runtime against the following finite allowlist:
`INVALID_CREDENTIALS`, `MISSING_CREDENTIALS`, `RATE_LIMITED`, `SERVER_ERROR`, `INTERNAL_ERROR`, `CLIENT_ERROR`, `INVALID_FIELDS`, `FIELD_TOO_LONG`, `SERVICE_INACTIVE`, `NO_PENDING_TICKETS`, `INVALID_STATUS`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CALL_FAILED`, `CONCURRENCY_CONFLICT`.

### CALL_NEXT Special Rule
When `CALL_NEXT` is executed and an active ticket at the counter is automatically completed, BAMSO **does not** emit a separate `COMPLETE` audit event. Instead, the side-effect is recorded in the `CALL_NEXT` event metadata:
```json
{
  "counter": "Quầy 1",
  "autoCompletedTicketId": "ticket-uuid"
}
```
This preserves the semantic clarity that a single action occurred with an explicit side-effect.

---

## 3. PII & Secret Minimization

To protect citizen privacy and comply with security requirements:
- **No PII in audit records:** `customerName`, `phone`, CCCD/VNeID identifiers, IP addresses, and device fingerprints are strictly excluded.
- **No secrets:** Passwords, password hashes, JWT tokens, cookies, and HTTP headers are never written to `AuditLog`.
- **Allowlisted metadata only:** Metadata is constrained to a compact JSON string limited to allowlisted keys (`counter`, `autoCompletedTicketId`). Unrecognized keys are automatically stripped.

---

## 4. Storage & Schema

The table does not enforce foreign key relations to domain tables (`User`, `Ticket`, `Service`) to preserve audit history independently from mutable domain lifecycle:

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  actorType  String   // USER | ANONYMOUS | SYSTEM
  actorId    String?
  actorRole  String?  // STAFF | ADMIN | null
  action     String   // LOGIN | TICKET_CREATED | CALL_NEXT | SKIP | COMPLETE | RESTORE
  entityType String   // AUTH | TICKET
  entityId   String?
  success    Boolean
  reasonCode String?
  metadata   String?
  createdAt  DateTime @default(now())

  @@index([createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@index([entityId, createdAt])
}
```

---

## 5. Retention & Purge Policy

- **Retention period:** 365 days (default).
- **Purge script:** `scripts/purge-audit-logs.py`
  - Uses standard Python `sqlite3` library.
  - Deterministic cutoff based on `createdAt < now - 365 days`.
  - Supports `--dry-run`, `--days <N>`, `--db <path>`.
  - npm script: `npm run audit:purge`.
- **Production deployment status:** Manual execution or scheduled via Windows Task Scheduler. Automated daily Task Scheduler job is **NOT YET CONFIGURED** on production hardware (planned for operational deployment phase).

---

## 6. Known Limitations

- **Database availability:** Because the audit log is stored in the local SQLite database, audit events cannot be recorded if the database file is locked, inaccessible, or the disk is full.
- **Local-first boundary:** Audit logs reside on the local server without real-time remote SIEM streaming.
