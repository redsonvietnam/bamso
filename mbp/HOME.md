---
id: MBP-BAMSO-HOME
version: 1
machine: HOME
---

# MBP Baseline — BAMSO HOME

## Project

- repository: redsonvietnam/bamso
- canonical_commit: c186c8907b66deb73f6f02510140691c3615846c

### Checkout

- commit: 30a039306e6ad95bf027085d4fa1358649a019cc
- branch: feat/bamso-continuity-context
- relation_to_canonical: AHEAD

## Platform

- os: Windows 10 Pro
- powershell: 5.1.19041.2673

## Toolchain

- node: v24.15.0
- npm: 11.12.1
- git: 2.53.0.windows.3

## Binding

- id: pcm-pwf
- version: "1.0"

## Baseline

- baseline_id: mbp-bamso-home-20260909
- created_at: 2026-09-09T14:00:00+07:00

## Verification

- status: CURRENT
- verified_at: 2026-09-09T14:00:00+07:00
- provenance: self-reported
- evidence:
  - canonical_commit exists in Git: YES
  - binding identity matches: pcm-pwf@1.0
  - toolchain versions recorded: YES

## Constraints

- No secrets recorded
- No credentials recorded
- No private keys recorded
- MBP is machine-local context only
- MBP != project canonical
- MBP != authority
- version: 1 is manifest schema version, not MBP specification version
