---
id: CONTEXT
version: 2
---

# BAMSO Continuity Context

## Project

- name: BAMSO
- repository: redsonvietnam/bamso

## Canonical

- branch: main
- commit: c186c8907b66deb73f6f02510140691c3615846c
- source: git

## Relays

### HOME

- branch: relay/bamso-home-20260908
- commit: c186c8907b66deb73f6f02510140691c3615846c
- status: CURRENT

### OFFICE

- branch: relay/bamso-office-20260909
- commit: c186c8907b66deb73f6f02510140691c3615846c
- status: CURRENT

## Framework

### PCM

- version: "1.0"
- commit: d8e09fa5ca9018569e44df41ee91ce069ab91ac5
- status: CANONICAL

### Binding

- id: pcm-pwf
- version: "1.0"
- status: CANONICAL

### MBP

- version: "0.1"
- commit: 52b1a96ca120454737bdb10f454ab85d6454de5d
- status: PROPOSED
- authority: companion-only

## Active

### Workstream

- id: UNKNOWN
- source: UNKNOWN

### Task

- id: UNKNOWN
- source: UNKNOWN
- status: UNKNOWN

## Handoff

- path: HANDOFF.md
- valid_at_commit: UNKNOWN
- status: UNKNOWN

## Decisions

- references: decisions.md
- supersession: explicit_only

## Evidence

### Model

Each evidence entry supports:
- path: artifact location
- verified_at_commit: SHA when verified
- status: CURRENT | HISTORICAL | STALE | UNKNOWN
- provenance: self-reported | independent | automatic

### Rules

- Old SHA: HISTORICAL/STALE
- Unknown binding: UNKNOWN
- Do not invent evidence entries that do not exist

## Machine

### HOME

- baseline_ref: UNKNOWN
- status: UNKNOWN

### OFFICE

- baseline_ref: UNKNOWN
- status: UNKNOWN

## Next

- action: UNKNOWN
- source: RECOMMENDATION
- authorized: false

---

## Semantic Rules

### Freshness

- actual Git HEAD == canonical.commit → usable/current
- actual Git HEAD != canonical.commit → CONTEXT STALE → Git wins

### Relay Status

- relay == canonical → CURRENT
- relay < canonical → STALE
- relay > canonical → AHEAD
- diverged → DIVERGED

AHEAD/DIVERGED must never become canonical automatically.

### Authority

- CONTEXT != canonical
- CONTEXT != authority
- next.authorized = false
- Git / explicit authority / GATE wins

### Handoff

HANDOFF remains usable only insofar as its canonical-state reference
is resolvable. If current validity cannot be established: UNKNOWN.
Do not duplicate HANDOFF contents.

### UNKNOWN Preservation

Preserve UNKNOWN for:
- active workstream
- active task
- handoff validity
- machine baselines

### Session Bootstrap

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

### Non-Goals

Do not:
- build memory DB
- build vector/graph DB
- add task inference
- add authority inference
- modify PCM
- modify MBP semantics
- modify BAMSO business logic
