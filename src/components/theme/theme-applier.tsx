"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useThemes } from "@/lib/theme/use-themes";
import { TOKEN_VARS } from "@/lib/theme/types";
import type { ThemeSpec } from "@/lib/theme/types";
import { fontStack, googleFontFamily, googleFontUrl, sansStack } from "@/lib/theme/fonts";
import { apiClient } from "@/lib/api-client";

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

/** Loads any Google Fonts a global setting uses (dedupe by family name). */
function loadGlobalGoogleFont(font: string) {
  const family = googleFontFamily(font);
  if (!family) return;
  const url = googleFontUrl(family);
  if (document.querySelector(`link[data-theme-font="${family}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.themeFont = family;
  document.head.appendChild(link);
}

/**
 * Applies a custom theme (from DB) at runtime: CSS vars + role classes +
 * Google Font links. Preset themes keep their own class-based CSS, so this
 * only kicks in for custom theme ids. Also applies the admin "Cài đặt chung"
 * overrides: surface opacity (--surface-alpha) + global font overrides.
 */
export function ThemeApplier() {
  const { theme } = useTheme();
  const { all, loading } = useThemes();
  const [globalFonts, setGlobalFonts] = useState<{ fontSans?: string; fontDisplay?: string }>({});
  const [surfaceOpacity, setSurfaceOpacity] = useState<string>("100%");

  // Load admin overrides from settings (custom-theme builder + global UI).
  useEffect(() => {
    let cancelled = false;
    const loadSettings = () => {
      apiClient
        .get<{ key: string; value: string }[]>("/api/settings")
        .then((settings) => {
          if (cancelled) return;
          const map: Record<string, string> = {};
          settings.forEach((s) => {
            map[s.key] = s.value;
          });
          const opacity = map["surface_opacity"];
          setSurfaceOpacity(opacity && !Number.isNaN(Number(opacity)) ? `${opacity}%` : "100%");
          setGlobalFonts({
            fontSans: map["font_sans"] || undefined,
            fontDisplay: map["font_display"] || undefined,
          });
        })
        .catch(() => {});
    };
    loadSettings();
    // Admin saves via /api/settings -> re-apply live without a page reload.
    const onSettingsUpdated = () => loadSettings();
    window.addEventListener("bamso:settings-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("bamso:settings-updated", onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (loading || !theme) return;
    const spec = all.find((t) => t.id === theme && !t.builtIn);
    if (spec) {
      applyTheme(spec);
    } else {
      clearTheme();
    }

    const root = document.documentElement;
    const style = root.style;

    // Surface opacity override (non-glass themes only). The glass theme keeps
    // its own translucent tokens, so we reset --surface-alpha to 100% there.
    const isGlass = theme === "glass" || (spec?.cardStyle ?? all.find((t) => t.id === theme)?.cardStyle) === "glass";
    if (isGlass) {
      style.setProperty("--surface-alpha", "100%");
    } else {
      style.setProperty("--surface-alpha", surfaceOpacity);
    }

    // Global font overrides (apply to every theme incl. presets).
    if (globalFonts.fontSans) {
      const sans = sansStack(globalFonts.fontSans);
      if (sans) style.setProperty("--font-sans", sans);
      loadGlobalGoogleFont(globalFonts.fontSans);
    }
    if (globalFonts.fontDisplay) {
      style.setProperty("--font-display", fontStack(globalFonts.fontDisplay));
      loadGlobalGoogleFont(globalFonts.fontDisplay);
    }
  }, [theme, all, loading, surfaceOpacity, globalFonts]);

  return null;
}
