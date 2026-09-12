# ROADMAP.md — Current Roadmap

> This is the single source of truth for current roadmap information.
> Updated: 2026-09-12

## Completed Work

- Rebuild v1.0 (Next.js 16 + Prisma + SQLite)
- PII leak fix (customerName/phone redaction for anonymous)
- Queue concurrency safety (mutex locks, conditional updates)
- SSE real-time sync (including hot-reload fix)
- Auth hardening (JWT + httpOnly cookie, RBAC)
- Cookie secure flag consistency
- CSP headers
- CI/CD (GitHub Actions)
- SQLite busy_timeout + connection_limit
- Call-next non-blocking fix (fire-and-forget broadcasts)
- Mobile responsive pass (/kiosk, /test-mode, /get-ticket, /display, /canbo)
- Domain audit logging (LOGIN, TICKET_CREATED, CALL_NEXT, SKIP, COMPLETE, RESTORE)
- Deterministic QR Scanner automated tests (Vitest/jsdom)
- Test suite hardening and MFA evidence closure
- MFA for ADMIN accounts: authorization boundary, TOTP/recovery flow, enrollment generation binding, concurrent disable handling, recovery regeneration fencing, Redis fail-closed semantics, and exact audit evidence
- Final validation baseline: 520 tests passed, 3 skipped; typecheck, lint, and build passed

## Current State

- **Production-ready:** main branch is stable
- **No active task:** UNKNOWN — check git history for recent work

## Deferred / Unknown Priority

- Redis production deployment (optional dependency)
- DEMO_MODE_ENABLED production setting
- Browser integration tests (Playwright/Cypress)

## Historical Tooling Plans

Tooling roadmap (CodeGraph, Spec Kit, Codebuff) is archived at `docs/archived/tooling-roadmap.md`. These were optional enhancements, not blockers.
