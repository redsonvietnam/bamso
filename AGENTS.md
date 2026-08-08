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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bamso** (1303 symbols, 2824 relationships, 105 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bamso/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bamso/clusters` | All functional areas |
| `gitnexus://repo/bamso/processes` | All execution flows |
| `gitnexus://repo/bamso/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
