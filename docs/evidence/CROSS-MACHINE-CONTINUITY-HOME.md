# Cross-Machine Continuity — HOME C1 Smoke Test

| Field | Value |
|-------|-------|
| Machine role | C1 / HOME |
| Branch | `relay/bamso-home-20260910-1543` |
| HEAD | `6c33bb2b43c644c119e6e1218285324ccac7bd24` |
| Date | 2026-09-11 |

## Validation Results

| Step | Result |
|------|--------|
| npm ci | PASS |
| prisma generate | PASS |
| npm run build | PASS |
| Workflow assets exist | PASS |

## Workflow Assets Verified

- `.opencode/rules/pcm-core.mdc` — present
- `pcm/docs/PCM.md` — present
- `pcm/docs/PWF.md` — present
- `pcm/docs/CONFORMANCE.md` — present
- `docs/WS-60-DEPLOYMENT-GUIDE.md` — present

## Confirmation

No OFFICE-local artifact was required. The HOME C1 machine successfully rebuilt
the entire application from the GitHub relay branch alone. All dependencies,
Prisma client, and production build completed without local state from the
OFFICE machine.
