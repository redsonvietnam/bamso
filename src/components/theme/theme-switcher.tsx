"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Landmark, PenLine, Stamp, GlassWater, ShieldCheck, Palette } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useThemes } from "@/lib/theme/use-themes";

const PRESET_OPTIONS = [
  { id: "chinh-quy", label: "Chính quy", icon: Landmark },
  { id: "doodle", label: "Doodle", icon: PenLine },
  { id: "riso", label: "Riso", icon: Stamp },
  { id: "glass", label: "Glass", icon: GlassWater },
  { id: "bca", label: "Công an", icon: ShieldCheck },
] as const;

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { customs } = useThemes();
  const pathname = usePathname();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  useEffect(() => {
    // Xoá class `.dark` còn sót từ localStorage theme cũ của template shadcn.
    document.documentElement.classList.remove("dark");
  }, []);

  if (pathname?.startsWith("/display")) return null;

  // Chờ hydration xong để tránh lệch aria-pressed giữa server/client (next-themes).
  if (!mounted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-wrap items-center gap-1 rounded-full border border-border bg-white/90 p-1 shadow-lg backdrop-blur">
      {PRESET_OPTIONS.map((option) => {
        const active = theme === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            aria-pressed={active}
            title={`Giao diện ${option.label}`}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </button>
        );
      })}
      {customs.map((option) => {
        const active = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            aria-pressed={active}
            title={`Giao diện ${option.name}`}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Palette className="h-3.5 w-3.5" />
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
