# HANDOFF.md

## Project Overview

**BAMSO** — Queue Management System for public service offices. Citizens take a number at a kiosk, staff call the next ticket, display board shows the queue.

**Stack:**
- Next.js 16.2.6 (App Router) + React 19 + TypeScript strict
- Prisma 6.3 ORM — SQLite (prisma/dev.db)
- Auth: jose JWT → HttpOnly cookie auth_token
- Real-time: SSE via src/lib/sse-broker.ts
- Redis: optional (rate-limit + cross-instance pub/sub, fail-open)

## Canonical Git State

- **Active branch:** `agent/bamso-core06-audit-snapshot-20261005` (pushed to origin through `16e7ad0`).
- The working tree may contain multiple workstreams; do not infer that every dirty file belongs to the customer/kiosk/UI workstream.
- Current source and tests are authoritative over historical handoff commit references.

## Key Files

| File | Purpose |
|------|---------|
| AGENTS.md | Agent coding discipline + workflow authority |
| CLAUDE.md | Technical conventions (auth, queue, Prisma, API) |
| decisions.md | Architectural decisions |
| docs/ROADMAP.md | Current roadmap |
| docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md | Security/technical reference |

## Run Commands

~~~bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm test             # Full suite; current pass/flake status is in "Fresh verification" below
npm run lint         # Lint (0 warnings in latest targeted/current verification)
npx tsc --noEmit     # Type check
node scratch/e2e-test.mjs  # E2E integration test
~~~

## Database

~~~bash
npx prisma db push   # Sync schema
npx prisma db seed   # Seed test data
npx prisma studio    # Visual DB browser
~~~

**Test accounts:** admin/admin@2026, canbo1/canbo1@123, staff2/staff2@2026

## Current Status

### Customer / kiosk / UI workstream

**Source state: COMPLETE for the recent implementation set.**

- Customer identity / CCCD parser: source fix present.
- QR scanner first-frame gate and QR auto-submit: source + focused tests present.
- Natural Vietnamese TTS: source + 35 focused tests pass.
- Citizen Home /: name-first flow is present; /get-ticket remains quick-ticket.
- /kiosk: mobile queue peek and inline Nhập tên are present; QR remains auto-submit.
- Call-next direct-next UX and 16s client timeout are present; server-side queue transaction remains authoritative.
- Thank-you overlay, vibration, and recent dvh viewport hardening are present.
- Trống Đồng watermark uses the optimized SVG and remains outside normal layout flow.

### Fresh verification — 2026-10-08 (post T137/T139 flaky fixes)

- npm run type-check: **PASS** (0 errors).
- npm run lint: **PASS** (`eslint src --max-warnings=0`, 0 errors, 0 warnings).
- npm run build: **PASS** (Next.js 16.2.6 production build).
- Full `npm test -- --run`: **GREEN ×3 consecutive runs** — 57 test files: 56 passed, 1 skipped; 627 tests: 625 passed, 2 skipped. Logs: `logs/t139b-run-{1,2,3}.log`.
- Both known flakes are fixed (test-only changes, no timeouts increased):
  - `KioskQueuePeek.test.tsx` breakpoint test no longer imports the whole Kiosk page graph (reads page source + contract assertions) — commit `fcdf562`.
  - `audit-service.test.ts` now scopes all cleanup/asserts to its own service/markers instead of global `deleteMany`/`count` (shared-DB Category A isolation) — see `logs/t139-run-*.log` for the pre-fix reproduction (2 failed) and `t139b-run-*.log` for post-fix GREEN ×3.
- Test stderr still contains React act(...) warnings in UI tests; they do not fail tests.
- No physical phone/kiosk/camera/vibration/TTS hardware UAT was performed.
- **Classification:** snapshot verified (code/tests/build/lint) · **production pending** · **physical UAT pending**.

### Fresh verification — 2026-10-08 (skip P2002 fix + E2E full green)

- `skipTicket` bulk `position:{increment}` → SQLite unique-index transient **P2002** with ≥2 pending contiguous tickets; fixed with per-row **descending** shift — commit `d1a2777`, regression test `48f7751`.
- E2E script had stale `CUSTOMER_PHONE` assertions (phone column removed in `a03b8da`) — `16e7ad0`.
- Gates: full suite **625/625 GREEN**, lint 0, type-check 0, build PASS, `node scratch/e2e-test.mjs` **FULL PASS** (Lấy số → Gọi số → Bỏ qua → Gọi lại → Hoàn tất + PII 4a–4d).
- **Local env hazard:** this machine's `:6379` is a black-hole listener (svchost, no real Redis). An awaited `redis.publish` never settles → skip/restore routes stall ~5 min. `.env` (gitignored) has `REDIS_HOST` commented out locally → single-instance fail-open mode as designed. With real Redis configured, `broadcastQueueUpdate` still has no publish timeout (known gap, Redis deferred per ROADMAP).

### UAT / stale-runtime handling

- Build first after source changes.
- scripts/restart-uat.bat is the **canonical UAT restart entrypoint**.
- scripts/start-uat.ps1 -Restart performs environment/PFX/JWT/DATABASE preflight **before** stopping the existing listener.
- Startup verifies .next/BUILD_ID, starts node server.js, reads the runtime's logged build identity, checks a referenced CSS asset for HTTP 200, then runs the local health check.
- scripts/stop-uat.ps1 returns success when no UAT listener exists and refuses to stop an unverified process.
- PFX password is process-scoped and SecureString-driven; it is not persisted by the helper.
- UAT ports are 3001 (HTTP redirect) and 3443 (HTTPS) when certificates are loaded.
- Fresh runtime/LAN/phone/camera evidence is still pending; this document does **not** claim UAT PASS.

### Production State / Blockers

- **Current machine:** DESKTOP-L79ACG7; development/runtime evidence is not production evidence.
- **Production runtime:** **NOT ESTABLISHED ON THIS MACHINE**.
- **Production host:** **NOT ESTABLISHED ON THIS MACHINE**.
- **Production database target:** **UNRESOLVED**. The actual production DATABASE_URL must be supplied externally.
- **Migrations:** blocked pending production DB preflight and human approval. The following remain unapplied/subject to approval:
  - 20260923180827_adopt_actual_database_schema
  - 20260923191500_reconcile_legacy_schema
  - 20260925072000_remove_ticket_phone
- **Other known production gates:** backup readiness, production secrets, LAN/TLS deployment, and physical camera/hardware acceptance remain unresolved where previously identified.
- **Secret rotation:** production JWT secret rotation is required before production use because the previous secret was exposed in agent output. The secret value is intentionally not recorded here.

### Production startup hardening

Complete and runtime verified in its dedicated verification. scripts/start-production.ps1 fails closed for development-mode startup and obvious development SQLite targets, including root dev.db and prisma/dev.db, while accepting legitimate production PostgreSQL and non-development SQLite targets. No migration or production server startup was performed by that verification.

### CORE-06 Display Call Durability

Implemented on current main with durable DisplayCallEvent persistence, recovery, eventId propagation, and client dedupe. Historical relay reports are historical evidence; current source and tests are authoritative.

## Next Action

For the customer/kiosk/UI workstream: perform fresh UAT/runtime/device acceptance rather than reopening source fixes.

For production deployment: identify the actual production host and production database target first; then perform DB preflight, backup verification, secret confirmation/rotation, and obtain human approval before any migration sequence.

## Historical Context

Session history and archived documents are in docs/sessions/ and docs/archived/. Historical documents are not current authority unless explicitly referenced as historical evidence.
