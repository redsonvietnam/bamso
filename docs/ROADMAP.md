# ROADMAP.md — Current Roadmap

> This is the single source of truth for current roadmap information.
> Updated: 2026-10-08

## Completed Work

- Rebuild v1.0 (Next.js 16 + Prisma + SQLite)
- PII leak fix (customerName/phone redaction for anonymous)
- Queue concurrency safety (mutex locks, conditional updates)
- SSE real-time sync (including hot-reload fix)
- Auth hardening (JWT + httpOnly cookie, RBAC)
- Cookie secure flag consistency
- CSP headers
- CI/CD (GitHub Actions)
- SQLite busy_timeout + connection_limit
- Call-next non-blocking fix (fire-and-forget broadcasts)
- Mobile responsive pass (/kiosk, /test-mode, /get-ticket, /display, /canbo)
- Domain audit logging (LOGIN, TICKET_CREATED, CALL_NEXT, SKIP, COMPLETE, RESTORE)
- Deterministic QR Scanner automated tests (Vitest/jsdom)
- Test suite hardening and MFA evidence closure
- MFA for ADMIN accounts: authorization boundary, TOTP/recovery flow, enrollment generation binding, concurrent disable handling, recovery regeneration fencing, Redis fail-closed semantics, and exact audit evidence
- Final validation baseline: historical baseline only; current verification is recorded in HANDOFF.md

## Current State

- **Current branch:** `agent/bamso-core06-audit-snapshot-20261005` (stable-baseline staging; **pushed to origin** — commits through `fcdf562` are on the remote).
- **Recent customer/kiosk/UI source work:** implemented; fresh physical/runtime acceptance remains pending.
- **Current audit:** type-check, lint and production build pass; both known flakes fixed test-only — `KioskQueuePeek` (`fcdf562`) and `audit-service` shared-DB isolation; full suite GREEN ×3 consecutive — see HANDOFF.md "Fresh verification — 2026-10-08".
- **Production deployment:** not established on this machine; see HANDOFF.md and deployment runbook for blockers.

## Recent Workstream Status

1. **C1b — Natural Vietnamese queue pronunciation — CODE COMPLETE**
   - Queue codes use natural Vietnamese pronunciation for A/B prefixes and 0–99 numbers.
   - Covered examples include 'A18 → a mười tám', 'A20 → a hai mươi', 'A21 → a hai mươi mốt', 'B34 → bê ba mươi tư'.
   - Existing digit-by-digit fallback remains for unsupported/longer numeric forms.

2. **Citizen Home / — name-first flow — CODE COMPLETE**
   - / renders the existing GetTicketFlow in homeNameFirst mode.
   - Service cards provide name entry plus a single 'Lấy số' action; whitespace-only names are rejected and names are trimmed before ticket creation.
   - /get-ticket remains the quick-ticket flow.

3. **Kiosk mobile — CODE COMPLETE**
   - /kiosk remains one-column below md, with the role contract 'Nhập tên' + 'Quét QR CCCD'.
   - Lightweight mobile queue peek is present; desktop retains the existing DisplayBoard presentation.
   - Kiosk name entry is inline in the service card with autofocus, Enter submit, cancel, validation, and submission locking.

4. **Responsive viewport hardening — CODE COMPLETE**
   - Recent fullscreen shells use dvh where the viewport-height contract required it.
   - The Trống Đồng watermark remains decorative/absolute and outside normal layout flow; the optimized SVG is used by PageWatermark.

5. **Customer identity / QR — SOURCE COMPLETE**
   - Current CCCD parser accepts the current 7+ field payload shape and legacy 6+ field shape.
   - QR success extracts customerName and auto-submits; no confirmation step is introduced.
   - Realtime queue updates preserve a locally handed-off customerName when the anonymous SSE payload omits it.

6. **Call-next / DisplayCall durability — SOURCE COMPLETE**
   - Direct-next staff UX is covered by existing queue-service atomicity and DisplayCallEvent durability.
   - Client call-next timeout is 16s while the generic API timeout remains 10s.
   - Timeout errors are normalized instead of exposing the browser's generic aborted-signal text.

7. **Thank-you / vibration — SOURCE COMPLETE**
   - Thank-you overlay is non-blocking and auto-dismisses.
   - Display vibration is opt-in and deduplicated by event identity.

## UAT / Acceptance Pending

- **#2 QR first-frame distortion:** physical-device/browser verification.
- **#3 customer identity:** fresh runtime verification of QR full name → Ticket.customerName → /waiting → QUEUE_UPDATE → customerName.
- **#4 call-next abort:** fresh-runtime UAT verification after the timeout/error fixes.
- **#8 duplicate quầy:** fresh-runtime UAT verification after TTS normalization.
- Mobile viewport acceptance at the target 360×800, 390×844, 844×390, 768×1024 sizes has not been physically re-run in this audit.

These are acceptance items only; do not recreate completed source fixes as new coding tasks.

## UAT Runtime Discipline

- Source/build change → npm run build → scripts/restart-uat.bat.
- scripts/start-uat.ps1 -Restart performs preflight before stopping an existing UAT listener.
- UAT startup verifies the current .next/BUILD_ID against the build identity reported by the runtime.
- UAT startup checks a referenced CSS asset and requires HTTP 200 before declaring the fresh runtime ready.
- scripts/stop-uat.ps1 treats no listener as a successful no-op and refuses to stop an unverified process.
- PFX/JWT/DATABASE credentials are process-scoped; the UAT helpers do not persist the PFX password.

## Deferred / Unknown Priority

- Redis production deployment (optional dependency)
- DEMO_MODE_ENABLED production setting
- Browser integration tests (Playwright/Cypress)

## Historical Tooling Plans

Tooling roadmap (CodeGraph, Spec Kit, Codebuff) is archived at docs/archived/tooling-roadmap.md. These were optional enhancements, not blockers.
