import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { PRESET_THEMES } from "@/lib/theme/presets";
import { getCustomThemes, saveCustomThemes } from "@/lib/theme/store";
import type { CustomTheme, ThemeSpec } from "@/lib/theme/types";

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

function validateTheme(body: unknown): CustomTheme | null {
  const t = body as Partial<ThemeSpec>;
  if (typeof t !== "object" || t === null) return null;
  if (!t.name || typeof t.name !== "string" || !t.name.trim()) return null;
  if (typeof t.fontSans !== "string" || typeof t.fontDisplay !== "string") return null;
  if (typeof t.radius !== "string") return null;
  return {
    id: t.id && typeof t.id === "string" ? t.id : "",
    name: t.name.trim(),
    builtIn: false,
    colors: t.colors && typeof t.colors === "object" ? (t.colors as ThemeSpec["colors"]) : {},
    fontSans: t.fontSans,
    fontDisplay: t.fontDisplay,
    radius: t.radius,
    cardStyle: (t.cardStyle as ThemeSpec["cardStyle"]) ?? "flat",
    buttonStyle: (t.buttonStyle as ThemeSpec["buttonStyle"]) ?? "solid",
    canvasStyle: (t.canvasStyle as ThemeSpec["canvasStyle"]) ?? "plain",
    headerStyle: (t.headerStyle as ThemeSpec["headerStyle"]) ?? "default",
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
