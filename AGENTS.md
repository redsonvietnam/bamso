# AGENTS.md — Instructions for AI coding agents

Universal and project-specific rules for any AI agent (Cursor, Claude Code, Codex, Copilot, etc.) working in this repository.

For run commands, Prisma, auth, queue conventions, and naming standards, also read [`CLAUDE.md`](CLAUDE.md).

---

## Agent Coding Discipline

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution over speed; use judgment on trivial tasks.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, and ask.

### 2. Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No features, abstractions, or configurability beyond what was asked.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite. Would a senior engineer call this overcomplicated?

### 3. Surgical Changes

- Touch only what you must. Don't improve adjacent code, comments, or formatting.
- Don't refactor unrelated broken-looking code. Match existing style.
- Clean up only your own mess.
- Match existing style, even if you'd do it differently.
- Unrelated dead code: mention it, don't delete unless asked.
- Remove imports/variables/functions that **your** changes made unused.
- Test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals:

- "Add validation" → tests for invalid inputs, then make them pass
- "Fix the bug" → test that reproduces it, then make it pass
- "Refactor X" → tests pass before and after

For multi-step tasks, state a brief plan with verification per step.

Example verify checklist for Bamso:
- Queue/auth/API changes → `node scratch/e2e-test.mjs`
- Schema changes → `npx prisma db push` and seed if needed
- UI changes → review `docs/design-system/` then check `/`, `/waiting`, `/admin`
- Merge `dev` → `main` only after `npm run build` passes and `codegraph sync .` if many files changed

Success signal: smaller diffs, fewer rewrites, clarifying questions before implementation — not after mistakes.

---

## Tooling & Workflow (nhánh `dev`)

- **Workflow active:** [`docs/workflow-v4.md`](docs/workflow-v4.md)
- **Roadmap từng phase:** [`docs/tooling-roadmap.md`](docs/tooling-roadmap.md)
- **CodeGraph (Phase 1):** Sau thay đổi lớn chạy `codegraph sync .` — index local tại `.codegraph/` (không commit DB)
- **Spec Kit (Phase 2):** Chỉ khi bắt đầu feature mới — chưa init; xem roadmap
- **Archive:** `workflow.md` V3.5 — prompt template cũ, không dùng làm workflow chính

---

<!-- BEGIN:nextjs-agent-rules -->
## Next.js

This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-system-rules -->
## Design System

For any UI/UX work in this repository, read these files first:

- `docs/design-system/README.md`
- `docs/design-system/perspective/SKILL.md`
- `docs/design-system/perspective/DESIGN.md`

Apply token and typography decisions from those files before writing component-level styles.
<!-- END:design-system-rules -->
