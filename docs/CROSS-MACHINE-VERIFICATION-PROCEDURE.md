---
id: CROSS-MACHINE-VERIFICATION-PROCEDURE
version: 1
status: DESIGN
---

# Cross-Machine Fresh-Session Verification Procedure

## Purpose

Deterministic procedure to verify real HOME ↔ OFFICE continuity
when both machines are available.

## Current Status

- HOME baseline: VERIFIED
- OFFICE baseline: NOT ESTABLISHED
- Real continuity: NOT PROVEN

## Critical Distinction

### Project Reconstruction

CONTEXT + Git + durable artifacts → reconstruct state?

**Can be tested statically.**

### Machine Continuity

destination machine + destination MBP + fresh session → continue context?

**Requires actual machine access.**

Not interchangeable.

---

## Test A: HOME → OFFICE

### Precondition

OFFICE MBP established at `mbp/OFFICE.md`.

### Step 1: On HOME (source)

Record:
- HOME baseline status: CURRENT
- Canonical commit: c186c8907b66deb73f6f02510140691c3615846c
- HOME checkout: 30a0393...
- relation_to_canonical: AHEAD

### Step 2: Move to OFFICE (destination)

### Step 3: On OFFICE — Fresh Session

Execute in order:

1. **Start fresh session** — no conversation history
2. **Read CONTEXT.md** — load project context
3. **Resolve Git HEAD** — `git rev-parse HEAD`
4. **Compare canonical SHA** — HEAD vs CONTEXT.canonical.commit
5. **Determine checkout relation** — Git ancestry, not numeric comparison
6. **Resolve machine baseline** — `mbp/OFFICE.md`
7. **Verify baseline matches machine** — hostname, platform, toolchain
8. **Evaluate MBP freshness** — baseline verification status
9. **Resolve PCM/PWF binding** — pcm-pwf@1.0 exists and loadable
10. **Evaluate HANDOFF** — valid_at_commit resolvable?
11. **Evaluate evidence** — provenance correct?
12. **Evaluate decisions** — supersession explicit only
13. **Resolve active task** — only from explicit durable source
14. **Preserve UNKNOWN** — if no authoritative source
15. **Verify next.action** — recommendation only, not authorization
16. **Record result** — all findings with evidence

### Expected Result

```
Project reconstruction: PASS/FAIL
Machine continuity: PASS/FAIL (requires actual OFFICE)
```

---

## Test B: OFFICE → HOME

Same procedure in reverse.

### Additional Check

HOME baseline remains valid or is detected STALE
if HOME machine state changed since baseline creation.

---

## Scenarios Matrix

| # | Scenario | Expected | Evidence Required |
|---|----------|----------|-------------------|
| 1 | destination baseline CURRENT | PASS | MBP exists, verified, matches machine |
| 2 | destination baseline STALE | DETECTED | MBP exists but checkout mismatch |
| 3 | destination baseline UNKNOWN | PRESERVED | No false promotion |
| 4 | destination baseline MISSING | DETECTED | No baseline file |
| 5 | canonical changed | RE-EVALUATE | Re-evaluate all references |
| 6 | checkout AHEAD | CORRECT | Git ancestry verified |
| 7 | checkout STALE | CORRECT | Git ancestry verified |
| 8 | checkout DIVERGED | CORRECT | Neither ancestor |
| 9 | HANDOFF stale | DETECTED | valid_at_commit unresolvable |
| 10 | evidence stale | DETECTED | provenance mismatch |
| 11 | active task absent | UNKNOWN preserved | No inference from branch |
| 12 | machine changed since baseline | RE-VERIFY | Re-run baseline verification |

---

## Acceptance Criteria

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

---

## Evidence Checklist

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

### Artifact to Capture

```
/home/user/bamso-verification/
├── session-start.txt
├── git-head.txt
├── canonical-comparison.txt
├── checkout-relation.txt
├── mbp-content.txt
├── baseline-match.txt
├── binding-resolution.txt
├── handoff-check.txt
├── evidence-check.txt
├── active-task.txt
├── authorization.txt
└── final-result.txt
```

---

## Expected PASS/FAIL Matrix

| Component | HOME → OFFICE | OFFICE → HOME |
|-----------|---------------|---------------|
| Project reconstruction | PASS (static) | PASS (static) |
| Machine continuity | NOT PROVEN | NOT PROVEN |
| Baseline verification | NOT PROVEN | PASS (HOME) |
| Binding resolution | NOT PROVEN | NOT PROVEN |
| Authority protection | PASS (design) | PASS (design) |
| Secret safety | PASS (static) | PASS (static) |

---

## Remaining Blocker

OFFICE physical access required.

## Follow-up

When OFFICE available:

1. Run WS-MBP-CONTINUITY-01B (establish OFFICE baseline)
2. Run this verification procedure
3. CC independently audits
4. R1 gates final result
