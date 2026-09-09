---
id: WS-MBP-CONTINUITY-02
version: 1
status: DESIGN
---

# WS-MBP-CONTINUITY-02: Cross-Machine Fresh-Session Verification

## 1. Objective

Design and document a deterministic verification procedure to prove
real HOME ↔ OFFICE continuity when both machines are available.

This document is the durable verification contract.

## 2. Definitions

### PROJECT RECONSTRUCTION

The ability to reconstruct project state from:
- CONTEXT.md
- Git repository state
- Referenced durable artifacts
- PCM/PWF binding

**Can be proven statically** without machine switching.

### MACHINE CONTINUITY

The ability to continue correct context on a destination machine using:
- Actual destination machine
- Actual destination MBP baseline
- Fresh session (no conversation history)

**Requires actual machine access.** Not interchangeable with project reconstruction.

## 3. HOME → OFFICE Procedure

### Precondition

OFFICE MBP established at `mbp/OFFICE.md`.

### On HOME (source)

Record:
- HOME baseline status
- Canonical commit
- HOME checkout
- relation_to_canonical

### Move to OFFICE (destination)

### On OFFICE — Fresh Session

Execute 16-step procedure (see Section 12).

## 4. OFFICE → HOME Procedure

Same procedure in reverse.

Additional check:
- HOME baseline remains valid or is detected STALE
- if HOME machine state changed since baseline creation

## 5. Fresh-Session Bootstrap

1. Read CONTEXT.md
2. Resolve Git HEAD
3. Compare canonical SHA
4. Detect stale
5. Resolve explicit active task
6. Evaluate relays
7. Evaluate handoff
8. Evaluate evidence
9. Evaluate decisions
10. Load PCM/binding
11. Preserve UNKNOWN
12. Treat next.action as recommendation
13. Execute only when authorized

## 6. Canonical / Checkout / Machine Separation

Three distinct concepts:

| Concept | Source | Meaning |
|---------|--------|---------|
| canonical | Git main branch | Project truth |
| checkout | Actual HEAD | Current working state |
| machine | MBP baseline | Machine-local context |

No field may mix these concepts.

## 7. Relay Semantics

Using Git ancestry (not numeric SHA comparison):

| Condition | Classification |
|-----------|----------------|
| relay == canonical | CURRENT |
| canonical is ancestor of relay | AHEAD |
| relay is ancestor of canonical | STALE |
| neither is ancestor | DIVERGED |

AHEAD/DIVERGED never become canonical automatically.

## 8. MBP Freshness Semantics

| Status | Meaning |
|--------|---------|
| CURRENT | Baseline verified, matches machine |
| STALE | Baseline exists but checkout differs |
| UNKNOWN | Insufficient evidence |
| MISSING | Baseline file does not exist |

## 9. HANDOFF / Evidence / Decisions Checks

### HANDOFF

- Reference `HANDOFF.md`, do not duplicate contents
- valid_at_commit must be resolvable
- If unresolvable: UNKNOWN

### Evidence

Each entry supports:
- path
- verified_at_commit
- status: CURRENT | HISTORICAL | STALE | UNKNOWN
- provenance: SELF-REPORTED | INDEPENDENT | AUTOMATIC

### Decisions

- Reference `decisions.md`
- Supersession: explicit only
- Age/conflicting prose must not implicitly supersede

## 10. UNKNOWN Preservation Rules

Preserve UNKNOWN for:
- active workstream
- active task
- handoff validity
- machine baselines (when insufficient evidence)

Never promote UNKNOWN without explicit evidence.

## 11. Authority Safety Rules

- CONTEXT != canonical
- CONTEXT != authority
- MBP != authority
- next.authorized = false
- Git / explicit authority / GATE wins

## 12. 16-Step Deterministic Procedure

Execute in order:

1. **Start fresh session** — no conversation history
2. **Read CONTEXT.md** — load project context
3. **Resolve Git HEAD** — `git rev-parse HEAD`
4. **Compare canonical SHA** — HEAD vs CONTEXT.canonical.commit
5. **Determine checkout relation** — Git ancestry, not numeric comparison
6. **Resolve machine baseline** — `mbp/<MACHINE>.md`
7. **Verify baseline matches machine** — platform, toolchain
8. **Evaluate MBP freshness** — baseline verification status
9. **Resolve PCM/PWF binding** — pcm-pwf@1.0 exists and loadable
10. **Evaluate HANDOFF** — valid_at_commit resolvable?
11. **Evaluate evidence** — provenance correct?
12. **Evaluate decisions** — supersession explicit only
13. **Resolve active task** — only from explicit durable source
14. **Preserve UNKNOWN** — if no authoritative source
15. **Verify next.action** — recommendation only, not authorization
16. **Record result** — all findings with evidence

## 13. Acceptance Criteria

### REAL CONTINUITY = PASS

Requires ALL:

- [ ] Actual destination machine used
- [ ] Actual destination MBP exists
- [ ] Fresh session performed (no conversation history)
- [ ] Project context reconstructed correctly
- [ ] Machine context reconstructed correctly
- [ ] No critical UNKNOWN incorrectly promoted
- [ ] Authority remains external to CONTEXT/MBP
- [ ] No canonicalization from relay/baseline
- [ ] Destination correctly identifies known/unknown

### NOT PROVEN

If ANY:

- [ ] Only static inspection performed
- [ ] Destination MBP missing
- [ ] Fresh session not performed
- [ ] Conversation history used
- [ ] UNKNOWN promoted without evidence

## 14. Evidence Checklist

### Per Direction

- [ ] Fresh session start timestamp
- [ ] Git HEAD resolution output
- [ ] Canonical SHA comparison result
- [ ] Checkout relation classification
- [ ] MBP baseline file content
- [ ] Baseline-machine match verification
- [ ] PCM/PWF binding resolution
- [ ] HANDOFF validity check
- [ ] Evidence provenance check
- [ ] Active task resolution (UNKNOWN or explicit source)
- [ ] Authorization status (false)
- [ ] Any UNKNOWN fields preserved
- [ ] Any STALE/MISSING detections

## 15. Adversarial Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | destination baseline CURRENT | PASS |
| 2 | destination baseline STALE | DETECT |
| 3 | destination baseline UNKNOWN | PRESERVE |
| 4 | destination baseline MISSING | DETECT |
| 5 | canonical changed | RE-EVALUATE |
| 6 | checkout AHEAD | CLASSIFY CORRECTLY |
| 7 | checkout STALE | CLASSIFY CORRECTLY |
| 8 | checkout DIVERGED | CLASSIFY CORRECTLY |
| 9 | stale HANDOFF | DETECT |
| 10 | stale evidence | DETECT |
| 11 | no active task | PRESERVE UNKNOWN |
| 12 | machine changed since baseline | RE-VERIFY |

## 16. Explicit Statements

### PROJECT RECONSTRUCTION

**Can be proven statically** using CONTEXT.md + Git + durable artifacts.

### REAL CROSS-MACHINE CONTINUITY

**NOT PROVEN** unless an actual fresh session is executed
on the destination machine.

## 17. Explicit Prohibitions

| Prohibition | Reason |
|-------------|--------|
| relay CURRENT != machine CURRENT | Different concepts |
| MBP CURRENT != authorization | MBP is context, not authority |
| recommendation != authorization | next.action is recommendation only |
| branch name != active task | No inference from branch |
| old HANDOFF != current authority | Historical, not current |

## 18. Evidence Provenance

| Provenance | Definition |
|------------|------------|
| SELF-REPORTED | Machine/session self-reports state |
| INDEPENDENT | External observer/method verifies |
| AUTOMATIC | System-inherent verification |

Use SELF-REPORTED if no independent evidence exists.
Never use INDEPENDENT without supporting evidence.

## 19. Failure Behavior

- UNKNOWN remains UNKNOWN
- No silent promotion
- No inference from incomplete evidence
- No authorization from baseline verification

## 20. Current Status

- HOME baseline: VERIFIED
- OFFICE baseline: NOT ESTABLISHED
- Real continuity: NOT PROVEN

## 21. Follow-up

When OFFICE available:

1. Run WS-MBP-CONTINUITY-01B (establish OFFICE baseline)
2. Run this verification procedure
3. CC independently audits
4. R1 gates final result
