# HANDOFF.md

## Project Overview

**BAMSO** — Queue Management System for public service offices. Citizens take a number at a kiosk, staff call the next ticket, display board shows the queue.

**Stack:**
- Next.js 16.2.6 (App Router) + React 19 + TypeScript strict
- Prisma 6.3 ORM — SQLite (`prisma/dev.db`)
- Auth: `jose` JWT → HttpOnly cookie `auth_token`
- Real-time: SSE via `src/lib/sse-broker.ts`
- Redis: optional (rate-limit + cross-instance pub/sub, fail-open)

## Canonical Git State

- **main:** `f2246069` — production-ready
- **Recent work:** mobile responsive pass (`d970ff3`, `020fa2a`), domain audit logging implementation and reasonCode contract (`323e558`, `f224606`)

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Agent coding discipline + workflow authority |
| `CLAUDE.md` | Technical conventions (auth, queue, Prisma, API) |
| `decisions.md` | Architectural decisions |
| `docs/ROADMAP.md` | Current roadmap |
| `docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md` | Security/technical reference |

## Run Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm test             # Test suite (394 passed, 2 skipped)
npm run lint         # Lint (0 warnings)
npx tsc --noEmit     # Type check (0 errors)
node scratch/e2e-test.mjs  # E2E integration test
```

## Database

```bash
npx prisma db push   # Sync schema
npx prisma db seed   # Seed test data
npx prisma studio    # Visual DB browser
```

**Test accounts:** admin/admin@2026, canbo1/canbo1@123, staff2/staff2@2026

## Current Status

**UNKNOWN** — No authoritatively established active task. Check `decisions.md` and recent git history for context.

## Historical Context

Session history and archived documents are in `docs/sessions/` and `docs/archived/`. These are historical records, not current authority.
