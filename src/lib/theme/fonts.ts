import type { FontId } from "./types";

/** Fonts compiled at build time via next/font in layout.tsx.
 *  Each maps to the CSS variable next/font generates on <html>. */
export const BUILTIN_FONTS: Record<FontId, { label: string; cssVar: string }> = {
  "be-vietnam-pro": { label: "Be Vietnam Pro", cssVar: "--font-sans" },
  oswald: { label: "Oswald", cssVar: "--font-oswald" },
  shantell: { label: "Shantell Sans", cssVar: "--font-shantell" },
  "space-grotesk": { label: "Space Grotesk", cssVar: "--font-space-grotesk" },
  "jetbrains-mono": { label: "JetBrains Mono", cssVar: "--font-mono" },
};

export const BUILTIN_FONT_IDS = Object.keys(BUILTIN_FONTS) as FontId[];

/** Curated Google Fonts with Vietnamese subset support.
 *  family is the CSS2 family name (spaces allowed); used for the
 *  runtime <link> injection when a user picks a non-builtin font. */
export const GOOGLE_FONTS: { family: string; label: string; category: "sans" | "serif" | "display" | "mono" }[] = [
  { family: "Be Vietnam Pro", label: "Be Vietnam Pro", category: "sans" },
  { family: "Oswald", label: "Oswald", category: "display" },
  { family: "Shantell Sans", label: "Shantell Sans", category: "display" },
  { family: "Space Grotesk", label: "Space Grotesk", category: "sans" },
  { family: "JetBrains Mono", label: "JetBrains Mono", category: "mono" },
  { family: "Inter", label: "Inter", category: "sans" },
  { family: "IBM Plex Sans", label: "IBM Plex Sans", category: "sans" },
  { family: "Roboto", label: "Roboto", category: "sans" },
  { family: "Montserrat", label: "Montserrat", category: "sans" },
  { family: "Nunito", label: "Nunito", category: "sans" },
  { family: "Barlow", label: "Barlow", category: "sans" },
  { family: "Saira", label: "Saira", category: "sans" },
  { family: "Raleway", label: "Raleway", category: "sans" },
  { family: "Lora", label: "Lora", category: "serif" },
  { family: "Playfair Display", label: "Playfair Display", category: "serif" },
  { family: "Source Sans 3", label: "Source Sans 3", category: "sans" },
];

export const FONT_OPTIONS: { value: string; label: string }[] = [
  ...BUILTIN_FONT_IDS.map((id) => ({
    value: id,
    label: `${BUILTIN_FONTS[id].label} (sẵn có)`,
  })),
  ...GOOGLE_FONTS.map((f) => ({
    value: `google:${f.family}`,
    label: `${f.label} (Google Font)`,
  })),
];

/** Extract the Google family from a `google:<family>` choice (null if not). */
export function googleFontFamily(font: string): string | null {
  return font.startsWith("google:") ? font.slice("google:".length) : null;
}

/** Resolve a font choice to a CSS font-family stack. */
export function fontStack(font: string): string {
  const google = googleFontFamily(font);
  if (google) return `'${google}', var(--font-sans), sans-serif`;
  const builtin = BUILTIN_FONTS[font as FontId];
  if (builtin) return `var(${builtin.cssVar}), var(--font-sans), sans-serif`;
  return `'${font}', var(--font-sans), sans-serif`;
}

/** Resolve the body font for --font-sans WITHOUT self-referencing --font-sans.
 *  Builtin fonts are already loaded by next/font, so nothing is needed. */
export function sansStack(font: string): string {
  const google = googleFontFamily(font);
  if (google) return `'${google}', ui-sans-serif, system-ui, sans-serif`;
  return "";
}

/** Google Fonts stylesheet URL for a family (empty string if not a Google font). */
export function googleFontUrl(family: string): string {
  const name = family.split(" ").join("+");
  return `https://fonts.googleapis.com/css2?family=${name}:wght@400;500;600;700;800&display=swap`;
}
