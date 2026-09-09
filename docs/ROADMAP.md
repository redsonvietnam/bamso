# ROADMAP.md — Current Roadmap

> This is the single source of truth for current roadmap information.
> Updated: 2026-09-09

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
- Test suite (374 tests, 0 failures)

## Current State

- **Production-ready:** main branch is stable
- **No active task:** UNKNOWN — check git history for recent work

## Deferred / Unknown Priority

- Redis production deployment (optional dependency)
- DEMO_MODE_ENABLED production setting
- Audit logging (login, ticket creation, call-next events)
- MFA for admin accounts
- QR Scanner automated tests
- Browser integration tests (Playwright/Cypress)

## Historical Tooling Plans

Tooling roadmap (CodeGraph, Spec Kit, Codebuff) is archived at `docs/archived/tooling-roadmap.md`. These were optional enhancements, not blockers.
