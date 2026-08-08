"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useThemes } from "@/lib/theme/use-themes";
import { TOKEN_VARS } from "@/lib/theme/types";
import type { ThemeSpec } from "@/lib/theme/types";
import { fontStack, googleFontFamily, googleFontUrl, sansStack } from "@/lib/theme/fonts";

const ROLE_CLASSES: Record<ThemeSpec["cardStyle"], string> = {
  flat: "",
  sketch: "surface-doodle",
  riso: "surface-riso",
  glass: "surface-glass",
  bca: "surface-bca",
};
const BTN_CLASSES: Record<ThemeSpec["buttonStyle"], string> = {
  solid: "",
  glass: "btn-glass",
  bca: "btn-bca",
};
const CANVAS_CLASSES: Record<ThemeSpec["canvasStyle"], string> = {
  plain: "",
  mesh: "canvas-mesh",
  halftone: "canvas-halftone",
  "paper-radial": "canvas-paper-radial",
};
const HEADER_CLASSES: Record<ThemeSpec["headerStyle"], string> = {
  default: "",
  glass: "header-glass",
  bca: "header-bca",
  "bca-transparent": "header-bca-transparent",
};

const ALL_ROLE_CLASSES = [
  ...Object.values(ROLE_CLASSES),
  ...Object.values(BTN_CLASSES),
  ...Object.values(CANVAS_CLASSES),
  ...Object.values(HEADER_CLASSES),
].filter(Boolean);

export function applyTheme(theme: ThemeSpec) {
  const root = document.documentElement;
  const style = root.style;

  // Inline CSS vars so the custom theme overrides the :root defaults.
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVar = TOKEN_VARS[key as keyof typeof TOKEN_VARS];
    if (cssVar && value) style.setProperty(cssVar, value);
  }
  style.setProperty("--radius", theme.radius);
  style.setProperty("--font-display", fontStack(theme.fontDisplay));
  const sans = sansStack(theme.fontSans);
  if (sans) style.setProperty("--font-sans", sans);
  else style.removeProperty("--font-sans");

  // Role classes drive the per-component treatment (surface/btn/canvas/header).
  const roles = [
    ROLE_CLASSES[theme.cardStyle],
    BTN_CLASSES[theme.buttonStyle],
    CANVAS_CLASSES[theme.canvasStyle],
    HEADER_CLASSES[theme.headerStyle],
  ].filter(Boolean);
  root.classList.remove(...ALL_ROLE_CLASSES);
  root.classList.add(...roles);

  // Load any Google Fonts the theme uses (dedupe by family name).
  for (const font of [theme.fontSans, theme.fontDisplay]) {
    const family = googleFontFamily(font);
    if (!family) continue;
    const url = googleFontUrl(family);
    if (document.querySelector(`link[data-theme-font="${family}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.themeFont = family;
    document.head.appendChild(link);
  }
}

export function clearTheme() {
  const root = document.documentElement;
  const style = root.style;
  for (const key of Object.keys(TOKEN_VARS)) {
    const cssVar = TOKEN_VARS[key as keyof typeof TOKEN_VARS];
    style.removeProperty(cssVar);
  }
  style.removeProperty("--radius");
  style.removeProperty("--font-display");
  style.removeProperty("--font-sans");
  root.classList.remove(...ALL_ROLE_CLASSES);
}

/**
 * Applies a custom theme (from DB) at runtime: CSS vars + role classes +
 * Google Font links. Preset themes keep their own class-based CSS, so this
 * only kicks in for custom theme ids.
 */
export function ThemeApplier() {
  const { theme } = useTheme();
  const { all, loading } = useThemes();

  useEffect(() => {
    if (loading || !theme) return;
    const spec = all.find((t) => t.id === theme && !t.builtIn);
    if (spec) {
      applyTheme(spec);
    } else {
      clearTheme();
    }
  }, [theme, all, loading]);

  return null;
}
