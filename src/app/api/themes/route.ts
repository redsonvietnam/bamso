import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { PRESET_THEMES } from "@/lib/theme/presets";
import { getCustomThemes, saveCustomThemes } from "@/lib/theme/store";
import type { CustomTheme, ThemeSpec } from "@/lib/theme/types";

const THEME_TOKEN_KEYS = new Set<keyof ThemeSpec["colors"]>([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "sidebar-background",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "display-accent",
  "display-red",
]);

const CARD_STYLES = new Set<ThemeSpec["cardStyle"]>(["flat", "sketch", "riso", "glass", "bca"]);
const BUTTON_STYLES = new Set<ThemeSpec["buttonStyle"]>(["solid", "glass", "bca"]);
const CANVAS_STYLES = new Set<ThemeSpec["canvasStyle"]>(["plain", "mesh", "halftone", "paper-radial"]);
const HEADER_STYLES = new Set<ThemeSpec["headerStyle"]>(["default", "glass", "bca", "bca-transparent"]);

const HSL_COLOR_PATTERN = /^[-+]?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*(?:0|1|0?\.\d+))?$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_TOKENS = new Set<keyof ThemeSpec["colors"]>(["display-accent", "display-red"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidColorValue(key: string, value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;

  const color = value.trim();
  if (HSL_COLOR_PATTERN.test(color)) return true;
  return HEX_COLOR_TOKENS.has(key as keyof ThemeSpec["colors"]) && HEX_COLOR_PATTERN.test(color);
}

function validateColors(value: unknown): ThemeSpec["colors"] | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;

  for (const [key, color] of Object.entries(value)) {
    if (!THEME_TOKEN_KEYS.has(key as keyof ThemeSpec["colors"]) || !isValidColorValue(key, color)) {
      return null;
    }
  }

  return value as ThemeSpec["colors"];
}

function validateTheme(body: unknown): CustomTheme | null {
  if (!isRecord(body)) return null;

  const t = body as Partial<ThemeSpec>;
  const colors = validateColors(t.colors);
  if (!isNonEmptyString(t.name)) return null;
  if (!isNonEmptyString(t.fontSans) || !isNonEmptyString(t.fontDisplay)) return null;
  if (!isNonEmptyString(t.radius)) return null;
  if (t.id !== undefined && !isNonEmptyString(t.id)) return null;
  if (t.cardStyle !== undefined && !CARD_STYLES.has(t.cardStyle)) return null;
  if (t.buttonStyle !== undefined && !BUTTON_STYLES.has(t.buttonStyle)) return null;
  if (t.canvasStyle !== undefined && !CANVAS_STYLES.has(t.canvasStyle)) return null;
  if (t.headerStyle !== undefined && !HEADER_STYLES.has(t.headerStyle)) return null;
  if (colors === null) return null;

  return {
    id: t.id ?? "",
    name: t.name.trim(),
    builtIn: false,
    colors,
    fontSans: t.fontSans,
    fontDisplay: t.fontDisplay,
    radius: t.radius,
    cardStyle: t.cardStyle ?? "flat",
    buttonStyle: t.buttonStyle ?? "solid",
    canvasStyle: t.canvasStyle ?? "plain",
    headerStyle: t.headerStyle ?? "default",
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `theme-${Date.now()}`;
}

export async function GET() {
  try {
    const customs = await getCustomThemes();
    return NextResponse.json({ presets: PRESET_THEMES, customs });
  } catch (error) {
    logger.error("Fetch themes error:", error);
    return NextResponse.json(
      { error: "Lỗi lấy danh sách giao diện", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

async function requireAdmin() {
  const auth = await requireRole("ADMIN");
  if ("error" in auth) return auth.error;
  return null;
}

export async function POST(request: Request) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const theme = validateTheme(body);
    if (!theme) {
      return NextResponse.json(
        { error: "Thông tin giao diện không hợp lệ", code: "INVALID_THEME" },
        { status: 400 }
      );
    }

    const customs = await getCustomThemes();
    const id = theme.id || slugify(theme.name);
    if (customs.some((t) => t.id === id)) {
      return NextResponse.json(
        { error: "Đã tồn tại giao diện trùng mã", code: "DUPLICATE_ID" },
        { status: 409 }
      );
    }

    const created: CustomTheme = { ...theme, id, builtIn: false };
    await saveCustomThemes([...customs, created]);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error("Create theme error:", error);
    return NextResponse.json(
      { error: "Lỗi tạo giao diện", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const theme = validateTheme(body);
    if (!theme || !theme.id) {
      return NextResponse.json(
        { error: "Thông tin giao diện không hợp lệ", code: "INVALID_THEME" },
        { status: 400 }
      );
    }

    const customs = await getCustomThemes();
    const index = customs.findIndex((t) => t.id === theme.id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Không tìm thấy giao diện", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const updated: CustomTheme = { ...theme, id: theme.id, builtIn: false };
    const next = [...customs];
    next[index] = updated;
    await saveCustomThemes(next);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Update theme error:", error);
    return NextResponse.json(
      { error: "Lỗi cập nhật giao diện", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const { id } = body as { id?: string };
    if (!id) {
      return NextResponse.json(
        { error: "Thiếu mã giao diện", code: "MISSING_PARAMS" },
        { status: 400 }
      );
    }

    const customs = await getCustomThemes();
    const next = customs.filter((t) => t.id !== id);
    if (next.length === customs.length) {
      return NextResponse.json(
        { error: "Không tìm thấy giao diện", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    await saveCustomThemes(next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Delete theme error:", error);
    return NextResponse.json(
      { error: "Lỗi xóa giao diện", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
