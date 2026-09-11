# Continuity Contract

> Durable continuity semantics for BAMSO repository.
> This document defines how continuity works across sessions.
> It is NOT workflow authority — `AGENTS.md` is.

---

## Purpose

This contract ensures any AI session can reconstruct operational context from repository evidence alone, without conversation memory.

---

## Continuity Layer Model

```
PCM (governance semantics)
    ↓
MBP (machine-local context)
    ↓
CONTEXT (bootstrap context)
    ↓
Git canonical state
    ↓
BAMSO (project-specific authority)
```

### PCM — Protocol for Canonical Management
- Location: `pcm/docs/PCM.md`
- Scope: External governance semantics
- Authority: External to BAMSO
- Relation: Provides governance primitives; does not authorize BAMSO operations

### MBP — Machine-Local Context
- Scope: Machine-specific state (local file system, runtime environment)
- Authority: NOT project authority
- Relation: Provides machine-local evidence; distinct from project canonical state

### CONTEXT — Bootstrap Context
- Location: `CONTEXT.md`
- Scope: Quick orientation for new sessions
- Authority: NOT authority — bootstrap only
- Relation: Points to durable contracts and authority entry points

### Git Canonical State
- Source: `git log`, branch history, repository evidence
- Authority: Wins over stale docs
- Relation: Canonical project state; overrides any document if stale

### BAMSO — Project Authority
- Workflow: `AGENTS.md`
- Technical: `CLAUDE.md`
- Decisions: `decisions.md`
- Roadmap: `docs/ROADMAP.md`
- Handoff: `HANDOFF.md`
- Security: `docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md`

---

## Continuity Invariants

1. **Bootstrap-only:** CONTEXT provides quick orientation, not canonical state.
2. **Not authority:** CONTEXT is NOT workflow authority — `AGENTS.md` is.
3. **Git wins:** Git canonical state wins over stale CONTEXT or any document.
4. **UNKNOWN preserved:** UNKNOWN must remain UNKNOWN when evidence is insufficient.
5. **Recommendation only:** `next.action` (if present) is recommendation only.
6. **No implicit authorization:** `next.authorized = false` unless explicit authority/GATE exists.
7. **MBP distinct:** MBP/machine baseline is distinct from project canonical state.
8. **Relay not canonical:** Relay is not canonical authority.
9. **Durable contracts:** Continuity semantics are defined here, not in CONTEXT itself.
10. **Evidence vs assertion:** Evidence/provenance must be distinguished from assertion.

---

## Session Reconstruction

A fresh session must reconstruct context from durable repository evidence:

1. **Read CONTEXT.md** — bootstrap orientation (5 seconds)
2. **Read AGENTS.md** — workflow authority
3. **Read CLAUDE.md** — technical conventions
4. **Read decisions.md** — architectural decisions
5. **Check git log** — canonical state, recent work
6. **Read HANDOFF.md** — operational continuity (if needed)
7. **For C1 resumption** — read `docs/conventions/c1-resumption-v1.md` + R1 brief

Do NOT:
- Rely on conversation memory
- Infer authority from CONTEXT
- Treat MBP as canonical project state
- Assume authorization from context

---

## Authority Model

| Concern | Authority | Operational Reference | NOT Authority |
|---------|-----------|----------------------|---------------|
| Workflow | `AGENTS.md` | — | CONTEXT, HANDOFF, MBP |
| Technical | `CLAUDE.md` | — | CONTEXT |
| Decisions | `decisions.md` | — | CONTEXT |
| Roadmap | `docs/ROADMAP.md` | — | CONTEXT |
| Operational | — | `HANDOFF.md` | CONTEXT, MBP |
| Canonical state | Git repository | — | Any document |
| Governance | PCM | — | BAMSO-specific docs |

### HANDOFF Semantics

HANDOFF is an **operational continuity artifact**, NOT authority:
- Describes current operational state
- Bridges sessions for continuity
- Does NOT authorize actions
- Does NOT override Git canonical state
- Does NOT override PCM governance
- Does NOT grant GATE semantics

---

## Reference Map

| Concept | Location | Purpose |
|---------|----------|---------|
| Continuity contract | `docs/continuity-contract.md` | This file |
| C1 resumption convention | `docs/conventions/c1-resumption-v1.md` | C1 session resumption protocol |
| Bootstrap context | `CONTEXT.md` | Quick orientation |
| Workflow authority | `AGENTS.md` | Agent coding discipline |
| Technical conventions | `CLAUDE.md` | Technical patterns |
| Architectural decisions | `decisions.md` | Decision records |
| Current roadmap | `docs/ROADMAP.md` | Roadmap source of truth |
| Operational handoff | `HANDOFF.md` | Operational continuity artifact |
| Security reference | `docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md` | Security/technical reference |
| Historical docs | `docs/archived/` | NOT current authority |
| Session records | `docs/sessions/` | Historical records |
| PCM governance | `pcm/docs/PCM.md` | External governance semantics |
