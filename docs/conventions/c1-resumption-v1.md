# C1 Resumption Convention v1

> Operational convention for resuming C1 execution across sessions, machines, and executors.
> This is documentation, not a framework.

---

## Canonical Model

```
ChatGPT conversation
    = coordination/context plane
    = R1 + CC + user context

Git repository
    = durable project/workstream state

C1 machine/session
    = execution environment
    = disposable / replaceable

Relay
    = optional Git transport mechanism

R1
    = authority/orchestration

CC
    = independent audit

C1
    = implementation executor
```

**Principle:** Never resume from agent memory. Resume from verified repository state + a live R1 brief.

---

## C1 Resumption Contract

A C1 instance MAY resume a TASK when and only when:

1. TASK is clearly defined by R1.
2. Repository state is accessible.
3. BASE_SHA is clearly defined by R1.
4. C1 verifies actual HEAD.
5. Working-tree state is checked.
6. Current machine capabilities satisfy project requirements.
7. C1 cross-references R1 brief against actual repository state.
8. C1 does not treat un-gated Proposed State as Canonical State.
9. On completion, C1 produces RESULT_SHA + evidence.
10. Next C1 resumes from the verified RESULT_SHA.

---

## R1 C1 Brief Template

Template for R1 to use when invoking C1:

```
C1 RESUME BRIEF

WORKSTREAM:
TASK:
BASE_SHA:
TARGET_BRANCH / RELAY:
EXPECTED_STATE:
CONSTRAINTS:

Before implementation:
1. Verify repository HEAD.
2. Verify working-tree state.
3. Verify required capabilities.
4. Compare actual repository state against this brief.
5. STOP on contradiction.

On completion:
- commit
- evidence
- push
- return RESULT_SHA
```

This is a template. Not a framework.

---

## Repository / Execution Verification

### BASE_SHA

R1 must specify which commit C1 starts from.

C1 must NOT interpret "latest commit" as sufficient.

C1 must know the exact BASE_SHA.

### HEAD CHECK

C1 must verify:

```
actual HEAD == expected BASE_SHA
```

or explicitly report divergence.

### WORKTREE

C1 must check whether working tree is:

```
CLEAN
```

or has local modifications.

If dirty state may affect the task:

- STOP and report to R1.
- Do NOT discard/reset/clean local changes automatically.

### CAPABILITY

No machine parity required. Only capability compatibility.

Project may declare current requirements through appropriate mechanisms, e.g.:

- `package.json` `engines`
- lockfile / package manager
- README / project requirements

No Machine Baseline registry.

### BRIEF / REPOSITORY CONTRADICTION

If R1 brief states a condition but repository does not reflect it:

- STOP.

Example:

```
R1: TASK starts after commit X
C1: actual HEAD = Y
```

Do NOT guess and continue.

---

## Evidence Convention

No `HANDOFF.md`. No agent memory file. No execution database.

Evidence lives in Git commit / PR description.

Minimum format:

```
TASK: <task-id>
STATE: IMPLEMENTED | PARTIAL | BLOCKED
BASE: <base-sha>
DONE: <short summary>
NEXT: <next action or blocker>
```

Example:

```
TASK: TASK-C.1
STATE: IMPLEMENTED
BASE: a551100
DONE: concurrent disable loser now returns 409
NEXT: R1/CC lifecycle re-audit
```

Evidence must be short. Do not copy conversation reasoning into commit.

---

## Handoff Semantics

HANDOFF is a PCM primitive. It is NOT removed.

HANDOFF = explicit transfer of execution responsibility between C1 instances grounded in a verified repository state.

HANDOFF may be represented by:

```
R1 live brief
+
BASE_SHA
+
RESULT_SHA
+
evidence
```

File is not required.

---

## Shared Relay Boundary

Relay is a transport mechanism. Not a PCM primitive.

```
Relay = transport
Relay ≠ authority
Relay ≠ canonical state
Relay ≠ agent memory
```

C1-A → commit/push → shared relay → C1-B fetch/verify → continue

C1 Resumption Convention works without relay. No hard-coding to specific branch naming.

---

## Concurrency

Do NOT create invariant:

```
1 WORKSTREAM = 1 C1
```

Instead, prohibit: uncontrolled concurrent mutation of the same TASK / branch state.

Two C1 instances working on independent TASKs or different execution boundaries are not a convention violation.

---

## Failure Modes

### A. C1 forgets to push

- **Cause:** C1 completes locally but does not push.
- **Detection:** R1 or next C1 sees RESULT_SHA missing from remote.
- **Behavior:** Next C1 cannot resume. R1 must resolve — push the local commit or reassign.

### B. Local branch stale

- **Cause:** Remote has advanced since C1 last fetched.
- **Detection:** `git fetch` + `git rev-parse HEAD` vs `origin/<branch>`.
- **Behavior:** C1 must fetch and re-verify BASE_SHA before starting. If diverged, STOP.

### C. C1 resumes from wrong state

- **Cause:** C1 uses a state that doesn't match R1 brief.
- **Detection:** HEAD check or brief/repository contradiction.
- **Behavior:** STOP. Report contradiction to R1.

### D. Concurrent mutation, same execution boundary

- **Cause:** Two C1 instances modify same TASK/branch simultaneously.
- **Detection:** Push rejection or unexpected diff.
- **Behavior:** C1 that pushed last wins. Other C1 must re-verify and reconcile.

### E. Capability mismatch

- **Cause:** Machine lacks required tools/versions.
- **Detection:** Build/test/lint fails.
- **Behavior:** STOP. Report to R1. Do not proceed with partial capability.

### F. Local DB/config differs from repository state

- **Cause:** Local database schema or config file drifted from committed state.
- **Detection:** `npx prisma db push` or build failure.
- **Behavior:** Sync local state with repository before proceeding. Or STOP if sync is unsafe.

### G. Skill/protocol version drift

- **Cause:** C1 uses outdated convention or protocol version.
- **Detection:** Convention document version mismatch.
- **Behavior:** C1 must use the version R1 specifies. If unspecified, use latest committed version.

### H. R1 brief grounded on old commit

- **Cause:** R1 references a BASE_SHA that is no longer on the branch.
- **Detection:** `git log` does not contain BASE_SHA.
- **Behavior:** STOP. R1 must provide updated brief.

### I. CC auditing current commit, C1 continues past it

- **Cause:** CC audits commit X, but C1 pushes commit Y on top before audit completes.
- **Detection:** CC reports audit target changed.
- **Behavior:** C1 must not push past a commit CC is actively auditing unless R1 explicitly authorizes.

### J. Relay contains Proposed State without GATE pass

- **Cause:** Relay branch has un-gated commits.
- **Detection:** Commit message lacks GATE approval or is not on canonical branch.
- **Behavior:** C1 must not treat un-gated relay commits as canonical.

### K. R1 brief changed but C1 uses stale brief

- **Cause:** R1 updated brief but C1 instance started before update.
- **Detection:** C1 brief contradicts latest R1 communication.
- **Behavior:** STOP. Request fresh brief from R1.

### L. Dirty working tree

- **Cause:** Uncommitted local modifications exist.
- **Detection:** `git status --short` shows modified files.
- **Behavior:** If modifications may affect task, STOP and report. Do not auto-discard.

---

## Scenario Validation

Expected behavior for each scenario:

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Office C1 → Home C1 | Home C1 fetches, verifies RESULT_SHA from office, continues from it |
| 2 | Home C1 → Office C1 | Office C1 fetches, verifies RESULT_SHA from home, continues from it |
| 3 | Same machine, new C1 session | New C1 reads brief + repo state, verifies, resumes |
| 4 | Different C1 executor | Same convention applies — executor is disposable |
| 5 | Compatible but different runtime | Works if capabilities match. No parity required |
| 6 | Stale branch | C1 fetches, detects divergence, STOPs if needed |
| 7 | Dirty worktree | C1 detects via `git status`, STOPs if task-affecting |
| 8 | R1 brief contradicts repo | C1 STOPs, reports contradiction |
| 9 | CC auditing current commit | C1 does not push past audit target without R1 authorization |
| 10 | Relay has Proposed State, GATE not passed | C1 does not treat as canonical |

---

## Git Workflow

1. Work on feature branch.
2. Do not modify canonical/main directly.
3. On completion:
   - Review diff
   - Verify no unintended PCM core changes
   - Commit
   - Push
   - Report: branch, commit SHA, files changed, validation, concerns
4. Do not self-merge.

---

## Success Criteria

A new executor can read:

1. C1 Resumption Convention
2. R1 brief
3. Repository state

and understand:

- Where do I start?
- What commit is authoritative?
- What must I verify?
- When must I stop?
- What must I leave behind?
- How does the next C1 continue?

Without needing a `HANDOFF.md` or agent-memory system.
