# BAMSO Workflow Status

> Canonical status snapshot for the PAIRFLOW hardening workflow.
>
> **Source of truth:** Git history and the current WIP branch. Older audit/handoff documents are historical and must not be used to infer current task status.

## Current branch

- **Branch:** `wip/bamso-hardening-review-2026-08-15`
- **Current HEAD:** `d1211496`
- **Current HEAD message:** `fix(auth): harden JWT role validation`
- **Status:** active WIP / review checkpoint branch
- **Merge policy:** DO NOT MERGE this branch as part of the PAIRFLOW workflow

## Current product architecture

The current WIP branch is the rebuilt BAMSO queue-management application. The repository README identifies the current stack as:

- Next.js 16 App Router + React 19 + TypeScript strict mode
- Prisma ORM + SQLite
- Native Server-Sent Events (SSE) for real-time synchronization
- JWT authentication using Jose and HttpOnly cookies
- Zustand for client-side Auth/Queue state
- Tailwind CSS, Shadcn/UI and related UI tooling

The queue domain uses a `Ticket.position` field for deterministic service order, and the SSE broker broadcasts queue changes to staff, display and tracking clients.

## Historical product foundations already present

The current WIP branch contains product work from earlier feature branches, including:

- `feature/sse-and-parser-fixes` — SSE synchronization and CCCD parser fixes (`bf0887d`)
- `feature/theme-builder-and-api-timeout` — Theme Builder, display board, and API timeout work (`dbd99a0`)

These are historical feature branches. Their presence in this list does not mean they are currently active workstreams.

## Important documentation correction

Older BAMSO audit/handoff material contains references to an earlier prototype architecture and concepts such as `sanPham`, `restore.json`, React/Zustand/Express/SQLite, etc. Those references are **not the current architecture/status of this WIP branch** and must not be used as the current product description or roadmap.

The current repository evidence does not contain `sanPham` or `restore.json` in the WIP code search, while the current README describes Next.js 16 + Prisma + SQLite. Therefore those prototype references are intentionally excluded from this canonical status document.

## Hardening / security status

| Workstream | Status | Notes |
|---|---|---|
| Task 1 — API timeout / AbortSignal / nonblocking ticket broadcast | CLOSED | Integrated in WIP; timeout abort, signal combination/cleanup, no abort retry, and nonblocking ticket broadcast regression coverage were completed. |
| Task 2 — APIClient retry policy | CLOSED | GET-only retry policy; retryable network/502/503/504; mutations and abort/timeout do not retry. |
| Task 3 — Theme API runtime validation | CLOSED | Runtime validation and regression coverage completed. |
| Task 4 — Theme lost-update protection | CLOSED | Optimistic locking plus concurrency evidence completed. |
| Task 5 — Theme import atomicity | CLOSED | All-or-nothing import behavior and regression coverage completed. |
| 6B — call-next safety | INTEGRATED | Task branch implementation was integrated into the WIP branch. |
| Task 9 — queue concurrency audit | INTEGRATED | Queue concurrency work was integrated into WIP. |
| Task 10 — position integrity | INTEGRATED | Concurrent ticket-position protection was integrated into WIP. |
| Task 11 — API validation consistency | INTEGRATED | Validation consistency work was integrated into WIP. |
| Task 12 — auth security | INTEGRATED / HARDENING CONTINUES | The dedicated Task 12 work was integrated; subsequent JWT role-validation hardening continued on the WIP branch. |

## Task branches that require ancestry-based interpretation

A task branch existing on GitHub does **not** by itself mean the work is unfinished. Check whether its commits are already ancestors of the WIP HEAD before treating it as active.

Known historical/task branches include:

- `task/6b-call-next-safety` — implementation integrated into WIP.
- `task/9-queue-concurrency-audit` — implementation integrated into WIP.
- `task/10-position-integrity` — implementation integrated into WIP.
- `task/11-api-validation-consistency` — implementation integrated into WIP.
- `task/12-auth-security` — implementation integrated into WIP.
- `task/7-restore-concurrency` — historical branch exists; integration status must be checked from ancestry before marking it independently closed.
- `task/8-rate-limiter` — historical branch exists; integration status must be checked from ancestry before marking it independently closed.

## Current position

The project is **past Task 12**. The current WIP branch is in **post-Task-12 hardening**, with the latest HEAD focused on JWT role-validation hardening.

Do not revert to an old Task 1–9 roadmap as the current plan. Any next task must be derived from the current WIP HEAD, active review findings, and the latest PAIRFLOW plan.

## PAIRFLOW operating model

- **Tab 1:** primary Builder/Coder and planner; may modify repository code through connected GitHub tooling.
- **Tab 2:** independent Reviewer; must not modify, commit, push, or merge code.
- **Local IDE/Cline:** used when local runtime/UI/terminal verification is required.
- Work proceeds as a closed loop: Tab 1 task → implementation → commit/push → Tab 2 independent review → fix if needed → next task.
- No squash, clean-history requirement, force-push, or merge requirement on this WIP branch.

## Updating this document

Update this file whenever the canonical WIP status changes materially. Before changing a task status, verify the actual Git ancestry/commits rather than relying on branch names or old handoff documents.
