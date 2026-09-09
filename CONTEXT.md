# CONTEXT.md — Continuity Context

> This file provides bootstrap context for AI agents and new team members.
> It is NOT workflow authority — that's `AGENTS.md`.

## Project Identity

**BAMSO** — Queue Management System for public service offices.

## Canonical Git State

- **main:** `19a7496` — production-ready
- **Repository:** `https://github.com/redsonvietnam/bamso`

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Workflow authority + coding discipline |
| `CLAUDE.md` | Technical conventions |
| `decisions.md` | Architectural decisions |
| `HANDOFF.md` | Current operational handoff |
| `docs/ROADMAP.md` | Current roadmap |
| `docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md` | Security/technical reference |

## Workflow

```
User / R1
    ↓
C1 execution (feature branch)
    ↓
CC independent review
    ↓
R1 GATE
    ↓
main (after merge)
```

## Stack

- Next.js 16.2.6 (App Router) + React 19 + TypeScript strict
- Prisma 6.3 ORM — SQLite
- Auth: `jose` JWT → HttpOnly cookie
- Real-time: SSE via `src/lib/sse-broker.ts`
- Redis: optional (rate-limit + pub/sub, fail-open)

## Historical Context

Session history and archived documents are in `docs/sessions/` and `docs/archived/`.
