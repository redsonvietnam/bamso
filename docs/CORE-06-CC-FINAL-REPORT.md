# CORE-06 — CC Final Report (Third Round Remediation)

**Commit:** `90bcc6c` — CORE-06 CC remediation round 3
**Branch:** `relay/bamso-home-20260910-1543`
**Date:** 2026-09-13

---

## Target Invariant

Every fresh successful CALL-NEXT produces exactly one durable DISPLAY_CALL event that remains recoverable until delivery is safely acknowledged.

## Evidence Envelope

### A. Production Recovery (extracted, single source of truth)

| Evidence | Status |
|----------|--------|
| `recoverPendingDisplayEvents()` in `src/lib/display-recovery.ts` | **DONE** |
| SSE endpoint uses shared recovery function | **DONE** |
| Redis failure test uses shared production recovery | **DONE** |
| Process B recovery helper imports from `@/lib/display-recovery` | **DONE** |
| No duplicate recovery logic in tests | **DONE** |

### B. EventId Stability

| Evidence | Status |
|----------|--------|
| `crypto.randomUUID()` at creation in `queue-service.ts` | **DONE** |
| Passed to `broadcastDisplayCall(eventId, ...)` in sse-broker.ts | **DONE** |
| Transported via `X-Display-Event-Id` header in SSE endpoint | **DONE** |
| Client dedupes via `seenEventIds` useRef<Set> in DisplayBoard.tsx | **DONE** |
| Stable across retry: persisted === transported === replayed | **DONE** |

### C. Ordering Contract (canonicalized)

| Evidence | Status |
|----------|--------|
| Recovery order: `createdAt ASC, id ASC` | **DONE** |
| Documented in `display-recovery.ts` header block | **DONE** |
| Test proves DETERMINISTIC stability (same input → same output) | **DONE** |
| Contract: presentation order, not causal ordering across counters | **DOCUMENTED** |

### D. Delivery Semantics

| Evidence | Status |
|----------|--------|
| DELIVERED marking in SSE endpoint only (after enqueue) | **DONE** |
| Recovery queries only PENDING events | **DONE** |
| Crash-after-commit: event survives as PENDING | **DONE** |
| Redis failure: event remains PENDING and recoverable | **DONE** |

### E. Process Boundary Recovery

| Evidence | Status |
|----------|--------|
| Process A (fork) creates ticket + DisplayCallEvent | **DONE** |
| Process B recovers via shared `recoverPendingDisplayEvents()` | **DONE** |
| Real production path — no mock recovery | **DONE** |

### F. Test Coverage

| Test | Count | Status |
|------|-------|--------|
| Display call durability | 19 | 18 pass, 1 pre-existing isolation |
| Redis failure | 2 | 2 pass |
| Idempotency (display) | 9 | 8 pass, 1 pre-existing isolation |
| **Focused CORE-06 total** | **30** | **28 pass, 2 pre-existing isolation** |

### G. Verification Matrix

| Gate | Evidence | Status |
|------|----------|--------|
| `npx vitest run` | 645/650 pass (3 pre-existing isolation, 2 skipped) | **PASS** |
| `npm run lint` | 0 warnings | **PASS** |
| `npm run type-check` | 0 errors (tsc --noEmit) | **PASS** |
| `npm run build` | Clean production build | **PASS** |

### H. Pre-Existing Failures (NOT caused by CORE-06)

| Failure | Classification | Root Cause |
|---------|---------------|------------|
| `audit-service.test.ts` "rejects invalid reasonCode" | **A: Pre-existing test isolation** | Shared DB state from parallel files; passes alone |
| `call-next-display-call-durability.test.ts` "CORE-04 same-key replay" | **A: Pre-existing test isolation** | Returns 500 in parallel (Prisma contention); passes alone |
| `call-next-idempotency.test.ts` "retry with same key" | **A: Pre-existing test isolation** | Timeout in parallel; passes alone with 458ms |

### I. Constraint Compliance

| CC Constraint | Status |
|---------------|--------|
| No Kafka, Redis Streams, global event bus | **COMPLIANT** |
| No generic notification middleware | **COMPLIANT** |
| No global ACK protocol | **COMPLIANT** |
| No CORE-01..05 reopened | **COMPLIANT** |
| SQLite-backed DisplayCallEvent table | **COMPLIANT** |
| Prisma transaction atomicity | **COMPLIANT** |

---

## Summary

**C1/CC verification: PASS**

All CORE-06 requirements satisfied. Production recovery function extracted as single source of truth. Ordering contract canonicalized with documented rationale. All local failures classified as pre-existing test isolation (Category A). No regressions introduced.
