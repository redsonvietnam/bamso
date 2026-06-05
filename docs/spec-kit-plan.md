# Spec Kit Plan — Phase 2

This document explains how Bamso should start using Spec Kit for a new feature.

## When to use Spec Kit

- You have a clear, scoped feature idea.
- The change spans multiple files, modules, or needs architecture alignment.
- You want a lightweight, reusable per-feature plan that the agent can follow.

## Goals

- Keep the repo stable on `dev` while planning new work.
- Avoid adding `.specify/` until a concrete feature is defined.
- Use Spec Kit to capture requirements, architecture, and verification steps.

## Recommended workflow

1. Choose the next feature or improvement.
2. Create a `SPEC` document from the template in `docs/spec-kit-template.md`.
3. Review and agree on scope before implementation.
4. If the feature is approved, run:
   ```bash
   specify init . --ai cursor --ignore-agent-tools
   ```
5. Use the generated `SPEC.md`, `BLUEPRINT.md`, and `DECISIONS.md` as the source of truth.
6. Implement the feature on `dev`.
7. Verify with:
   - `npm run build`
   - `node scratch/e2e-test.mjs`
   - manual check of affected UI routes if applicable

## What to capture in the feature plan

- Feature goal and scope
- User stories
- Acceptance criteria
- Architecture decisions
- Verification checklist

## Next step for Bamso

- Pick a small but valuable feature to plan.
- Fill the template in `docs/spec-kit-template.md`.
- I can then help convert it into a formal `SPEC.md` and `BLUEPRINT.md`.
