# Design Tokens — Perspective

This file defines the active visual language for Bamso UI.

## Theme overview

- Brand color: **Primary green** with a calm tech-forward feeling.
- Backgrounds: soft neutrals and white surfaces.
- Text: high-contrast dark foreground with subtle muted text for secondary content.
- Shapes: gentle rounded corners and soft shadows.

## Color tokens

- `primary`: `#00BD7D`
- `primary-foreground`: `#0F172A`
- `foreground`: `#111827`
- `muted-foreground`: `#6B7280`
- `background`: `#F8FAFC`
- `surface`: `#FFFFFF`
- `surface-muted`: `#F1F5F9`
- `border`: `#E2E8F0`
- `border-strong`: `#CBD5E1`
- `success`: `#22C55E`
- `danger`: `#EF4444`
- `warning`: `#F59E0B`

## Typography

- Heading family: `--font-display` for large titles and hero text.
- Body family: system sans-serif or the project default font for readable paragraphs.
- Scale:
  - `display-xl`: very large uppercase hero headings
  - `heading-lg`: bold section headings
  - `body-lg`: large body text for emphasis
  - `body`: normal paragraph text
  - `muted`: smaller text for hints and captions

## Spacing

- Use a modular spacing scale: `4`, `8`, `12`, `16`, `24`, `32`, `40`, `48`.
- Apply consistent padding inside cards and sections.
- Keep horizontal layouts responsive; stack vertically on smaller screens.

## Elevation & surfaces

- Primary surfaces: `surface` with subtle shadow.
- Secondary surfaces: `surface-muted` or light gray backgrounds.
- Cards: rounded corners with a minimal ring or border.

## Components guidance

- Buttons:
  - Primary: `primary` background, white text.
  - Secondary: neutral background, dark text.
  - Ghost: transparent background with border.
- Alerts:
  - Success: light green background with strong green accent.
  - Warning: light amber background with amber accent.
  - Danger: light red background with red accent.
- Forms:
  - Use clear labels and spacing.
  - Inputs should use `surface` background and `border`.

## How to use

- For any UI change, reference this file first.
- If a new token is needed, add it here and use it consistently across components.
- Keep the UI aligned with the existing brand style rather than creating a new visual direction.
