# Design System Skill — Perspective

This file guides AI and developers when updating UI or styles for Bamso.

## Purpose

- Ensure all UI changes follow the current design token set.
- Keep typography, color, spacing, and component patterns consistent.
- Avoid introducing ad hoc styling or new theme colors.

## Read first

- `docs/design-system/perspective/DESIGN.md`
- `docs/design-system/README.md`

## Rules for UI changes

1. Start from the design tokens in `DESIGN.md`.
2. Use existing utility classes and theme tokens where possible.
3. For new UI components, prefer the existing visual language: clean cards, soft borders, neutral backgrounds, strong contrast for actions.
4. Do not invent new color names or custom CSS variables unless the design token list explicitly includes them.
5. Keep spacing and layout consistent with existing pages: use defined spacing scales, centered cards, and responsive stacks.
6. When updating text styles, match font weight and size conventions rather than applying random utilities.
7. Validate the changes visually on `/`, `/waiting`, `/admin`, `/display`.

## Accessibility

- All text must meet accessible contrast ratios.
- Buttons and interactive elements should be clearly distinguishable.
- Avoid purely color-based status cues.

## When to update this file

- If the token set changes significantly.
- If the design system expands beyond the current perspective.
