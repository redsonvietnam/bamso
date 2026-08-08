"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { CustomTheme, ThemeSpec } from "./types";

type ThemesResponse = { presets: ThemeSpec[]; customs: CustomTheme[] };

/** Client-side loader for all themes (presets + DB custom themes). */
export function useThemes() {
  const [presets, setPresets] = useState<ThemeSpec[]>([]);
  const [customs, setCustoms] = useState<CustomTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient
      .get<ThemesResponse>("/api/themes")
      .then((data) => {
        if (!active) return;
        setPresets(data.presets ?? []);
        setCustoms(data.customs ?? []);
      })
      .catch(() => {
        if (!active) return;
        setPresets([]);
        setCustoms([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  return { presets, customs, all: [...presets, ...customs], loading, reload };
}
