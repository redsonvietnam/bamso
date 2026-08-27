"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Eye, EyeOff, Pencil, Download, Upload, Check } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useThemes } from "@/lib/theme/use-themes";
import type { CustomTheme, ThemeSpec } from "@/lib/theme/types";
import {
  CARD_STYLE_LABELS,
  BUTTON_STYLE_LABELS,
  CANVAS_STYLE_LABELS,
  HEADER_STYLE_LABELS,
  COLOR_TOKEN_LABELS,
} from "@/lib/theme/types";
import { FONT_OPTIONS } from "@/lib/theme/fonts";
import { CHINH_QUY_COLORS } from "@/lib/theme/presets";
import { hslToHex, hexToHsl } from "@/lib/theme/color";
import { applyTheme, clearTheme } from "@/components/theme/theme-applier";

function emptyTheme(): CustomTheme {
  return {
    id: "",
    name: "",
    builtIn: false,
    colors: { ...CHINH_QUY_COLORS },
    fontSans: "be-vietnam-pro",
    fontDisplay: "oswald",
    radius: "0.625rem",
    cardStyle: "flat",
    buttonStyle: "solid",
    canvasStyle: "plain",
    headerStyle: "default",
  };
}

function cloneFrom(base: ThemeSpec, name: string): CustomTheme {
  return {
    ...base,
    id: "",
    name,
    builtIn: false,
    colors: { ...base.colors },
  };
}

export default function ThemeBuilderPanel() {
  const { presets, customs, loading, reload } = useThemes();
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const previousThemeRef = useRef<ThemeSpec | null>(null);

  const all = useMemo(() => [...presets, ...customs], [presets, customs]);

  const startNew = () => {
    setEditing(emptyTheme());
    setIsNew(true);
    setPreviewActive(false);
  };

  const startClone = (base: ThemeSpec) => {
    setEditing(cloneFrom(base, `${base.name} bản sao`));
    setIsNew(true);
    setPreviewActive(false);
  };

  const startEdit = (theme: CustomTheme) => {
    setEditing({ ...theme, colors: { ...theme.colors } });
    setIsNew(false);
    setPreviewActive(false);
  };

  const stopEdit = () => {
    setEditing(null);
    setPreviewActive(false);
    clearTheme();
  };

  const startPreview = useCallback(() => {
    if (!editing) return;
    const root = document.documentElement;
    const currentStyles: Record<string, string> = {};
    for (const key of Object.keys(root.style)) {
      currentStyles[key] = root.style.getPropertyValue(key);
    }
    previousThemeRef.current = {
      id: "previous",
      name: "Previous",
      builtIn: false,
      colors: {},
      fontSans: "inter",
      fontDisplay: "inter",
      radius: "0.625rem",
      cardStyle: "flat",
      buttonStyle: "solid",
      canvasStyle: "plain",
      headerStyle: "default",
    };
    applyTheme(editing);
    setPreviewActive(true);
    toast.info("Đang xem trước. Thoát để quay lại giao diện đã lưu.");
  }, [editing]);

  const stopPreview = useCallback(() => {
    if (previousThemeRef.current) {
      applyTheme(previousThemeRef.current);
    } else {
      clearTheme();
    }
    setPreviewActive(false);
    previousThemeRef.current = null;
  }, []);

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) {
      toast.error("Vui lòng nhập tên giao diện.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await apiClient.post<CustomTheme>("/api/themes", editing);
        toast.success("Đã tạo giao diện mới.");
      } else {
        await apiClient.put<CustomTheme>("/api/themes", editing);
        toast.success("Đã cập nhật giao diện.");
      }
      await reload();
      stopEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi lưu giao diện.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa giao diện này?")) return;
    try {
      await apiClient.request<{ ok: boolean }>("/api/themes", {
        method: "DELETE",
        body: { id },
      });
      toast.success("Đã xóa giao diện.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi xóa giao diện.");
    }
  };

  const handleExport = () => {
    const payload = JSON.stringify({ presets, customs }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bamso-themes.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        const imported = Array.isArray(data) ? data : data.customs;
        if (!Array.isArray(imported)) throw new Error("bad format");
        await apiClient.post<CustomTheme[]>("/api/themes", { themes: imported });
        toast.success("Đã nhập giao diện.");
        await reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Lỗi nhập giao diện.");
      }
    };
    reader.readAsText(file);
  };

  if (loading) return <p className="text-muted-foreground">Đang tải...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Giao diện</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Xuất
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" type="button">
              <Upload className="w-4 h-4 mr-1" /> Nhập
            </Button>
          </label>
          <Button size="sm" onClick={startNew}>
            <Plus className="w-4 h-4 mr-1" /> Giao diện mới
          </Button>
        </div>
      </div>

      {editing ? (
        <ThemeEditor
          theme={editing}
          isNew={isNew}
          saving={saving}
          previewActive={previewActive}
          onChange={setEditing}
          onPreview={startPreview}
          onStopPreview={stopPreview}
          onSave={handleSave}
          onCancel={stopEdit}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {all.map((theme) => (
            <Card key={theme.id} className="overflow-hidden">
              <ThemeSwatch theme={theme} />
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{theme.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {theme.builtIn ? "Có sẵn" : "Tùy chỉnh"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!theme.builtIn && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => startEdit(theme as CustomTheme)} title="Sửa" aria-label="Sửa">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(theme.id)} title="Xóa" aria-label="Xóa">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => startClone(theme)} title="Nhân bản" aria-label="Nhân bản">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeSwatch({ theme }: { theme: ThemeSpec }) {
  const tokens: [string, string][] = [
    ["background", theme.colors.background ?? "#fff"],
    ["card", theme.colors.card ?? "#fff"],
    ["primary", theme.colors.primary ?? "#000"],
    ["secondary", theme.colors.secondary ?? "#eee"],
    ["accent", theme.colors.accent ?? "#ddd"],
    ["border", theme.colors.border ?? "#ccc"],
    ["foreground", theme.colors.foreground ?? "#111"],
    ["display-accent", theme.colors["display-accent"] ?? "#999"],
  ];
  return (
    <div className="flex h-12 items-center gap-1.5 px-3 border-b">
      {tokens.map(([key, value]) => (
        <span
          key={key}
          title={key}
          className="h-6 flex-1 rounded border border-black/10"
          style={{ backgroundColor: hslToHex(value) }}
        />
      ))}
    </div>
  );
}

function ThemeEditor({
  theme,
  isNew,
  saving,
  previewActive,
  onChange,
  onPreview,
  onStopPreview,
  onSave,
  onCancel,
}: {
  theme: CustomTheme;
  isNew: boolean;
  saving: boolean;
  previewActive: boolean;
  onChange: (t: CustomTheme) => void;
  onPreview: () => void;
  onStopPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const patch = (p: Partial<CustomTheme>) => onChange({ ...theme, ...p });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{isNew ? "Giao diện mới" : `Chỉnh sửa: ${theme.name}`}</CardTitle>
          <CardDescription>
            Chỉnh màu, font, bo góc và phong cách thành phần. Bấm <b>Xem trước</b> để áp dụng ngay lên trang mà không lưu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>Tên giao diện</Label>
            <Input
              value={theme.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Ví dụ: Công an xã - Phong cách mới"
              className="mt-1 max-w-md"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Font chữ thường</Label>
              <Select value={theme.fontSans} onValueChange={(v) => patch({ fontSans: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Font chữ tiêu đề</Label>
              <Select value={theme.fontDisplay} onValueChange={(v) => patch({ fontDisplay: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Bo góc (radius)</Label>
              <Select
                value={theme.radius}
                onValueChange={(v) => patch({ radius: v })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0rem", "0.25rem", "0.375rem", "0.5rem", "0.625rem", "0.75rem", "1rem", "1.25rem", "1.5rem"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kiểu thẻ (Card)</Label>
              <Select value={theme.cardStyle} onValueChange={(v) => patch({ cardStyle: v as CustomTheme["cardStyle"] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD_STYLE_LABELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Kiểu nút</Label>
              <Select value={theme.buttonStyle} onValueChange={(v) => patch({ buttonStyle: v as CustomTheme["buttonStyle"] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUTTON_STYLE_LABELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kiểu nền trang</Label>
              <Select value={theme.canvasStyle} onValueChange={(v) => patch({ canvasStyle: v as CustomTheme["canvasStyle"] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANVAS_STYLE_LABELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kiểu thanh trên</Label>
              <Select value={theme.headerStyle} onValueChange={(v) => patch({ headerStyle: v as CustomTheme["headerStyle"] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEADER_STYLE_LABELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Màu sắc</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {COLOR_TOKEN_LABELS.map(({ key, label }) => (
                <ColorField
                  key={key}
                  label={label}
                  value={theme.colors[key] ?? ""}
                  onChange={(v) =>
                    patch({ colors: { ...theme.colors, [key]: hexToHsl(v) } })
                  }
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Thao tác</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {previewActive ? (
              <Button className="w-full" variant="outline" onClick={onStopPreview}>
                <EyeOff className="w-4 h-4 mr-1" /> Thoát xem trước
              </Button>
            ) : (
              <Button className="w-full" onClick={onPreview}>
                <Eye className="w-4 h-4 mr-1" /> Xem trước
              </Button>
            )}
            <Button className="w-full" variant="default" onClick={onSave} disabled={saving}>
              <Check className="w-4 h-4 mr-1" /> {isNew ? "Tạo giao diện" : "Lưu thay đổi"}
            </Button>
            <Button className="w-full" variant="outline" onClick={onCancel}>
              Hủy
            </Button>
          </CardContent>
        </Card>
        {previewActive ? (
          <p className="text-sm text-primary font-medium px-2">
            Đang xem trước giao diện. Bấm &quot;Thoát xem trước&quot; để quay lại.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground px-2">
            Giao diện được lưu trong cài đặt hệ thống và áp dụng cho toàn bộ máy. Có thể xem trước trước khi lưu.
          </p>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-input px-2 py-1.5">
      <label
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded border border-border"
        title={value}
      >
        <span className="absolute inset-0" style={{ backgroundColor: hslToHex(value) }} />
        <input
          type="color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={hslToHex(value).slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
