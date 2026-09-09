# CONTEXT.md — Continuity Bootstrap

> **Bootstrap context only.** Not authority, not canonical state.
> Git canonical state wins if CONTEXT is stale.

## Identity

**BAMSO** — Queue Management System for public service offices.

## Canonical Reference

- **main:** `19a7496`
- **Repository:** `https://github.com/redsonvietnam/bamso`

## Authority Entry Points

| Concern | Source |
|---------|--------|
| Workflow | `AGENTS.md` |
| Technical | `CLAUDE.md` |
| Decisions | `decisions.md` |
| Roadmap | `docs/ROADMAP.md` |
| Handoff | `HANDOFF.md` |
| Security | `docs/BAMSO-TECHNICAL-SECURITY-DOSSIER.md` |

## Continuity Invariants

1. CONTEXT is bootstrap context only — not canonical state.
2. CONTEXT is NOT authority — `AGENTS.md` is workflow authority.
3. Git canonical state wins if CONTEXT is stale.
4. UNKNOWN must remain UNKNOWN when evidence is insufficient.
5. `next.action` (if present) is recommendation only.
6. `next.authorized = false` unless explicit authority/GATE exists.
7. MBP/machine baseline is distinct from project canonical state.
8. Relay is not canonical authority.
9. Continuity semantics are defined in durable contracts, not CONTEXT itself.

## References

- **MBP:** Machine-local context (not project authority)
- **PCM:** External governance/authority semantics
- **Archive:** `docs/archived/` — historical, not current
- **Sessions:** `docs/sessions/` — historical records

## UNKNOWN

Active task: UNKNOWN (no authoritatively established current task).
