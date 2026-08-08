export type ThemeTokenKey =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "border"
  | "input"
  | "ring"
  | "sidebar-background"
  | "sidebar-foreground"
  | "sidebar-primary"
  | "sidebar-primary-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border"
  | "sidebar-ring"
  | "display-accent"
  | "display-red";

export type CardStyle = "flat" | "sketch" | "riso" | "glass" | "bca";
export type ButtonStyle = "solid" | "glass" | "bca";
export type CanvasStyle = "plain" | "mesh" | "halftone" | "paper-radial";
export type HeaderStyle = "default" | "glass" | "bca" | "bca-transparent";
export type FontId = string;

export type ThemeSpec = {
  id: string;
  name: string;
  builtIn: boolean;
  /** HSL triplet strings, e.g. "222 68% 25%" (optionally with alpha "/ 0.9"). */
  colors: Partial<Record<ThemeTokenKey, string>>;
  fontSans: FontId;
  fontDisplay: FontId;
  radius: string;
  cardStyle: CardStyle;
  buttonStyle: ButtonStyle;
  canvasStyle: CanvasStyle;
  headerStyle: HeaderStyle;
};

export type CustomTheme = ThemeSpec;

/** CSS variable names we control per token. */
export const TOKEN_VARS: Record<ThemeTokenKey, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  "card-foreground": "--card-foreground",
  primary: "--primary",
  "primary-foreground": "--primary-foreground",
  secondary: "--secondary",
  "secondary-foreground": "--secondary-foreground",
  muted: "--muted",
  "muted-foreground": "--muted-foreground",
  accent: "--accent",
  "accent-foreground": "--accent-foreground",
  destructive: "--destructive",
  "destructive-foreground": "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  "sidebar-background": "--sidebar-background",
  "sidebar-foreground": "--sidebar-foreground",
  "sidebar-primary": "--sidebar-primary",
  "sidebar-primary-foreground": "--sidebar-primary-foreground",
  "sidebar-accent": "--sidebar-accent",
  "sidebar-accent-foreground": "--sidebar-accent-foreground",
  "sidebar-border": "--sidebar-border",
  "sidebar-ring": "--sidebar-ring",
  "display-accent": "--display-accent",
  "display-red": "--display-red",
};

/** Color tokens the ThemeBuilder exposes as pickers (label map). */
export const COLOR_TOKEN_LABELS: { key: ThemeTokenKey; label: string }[] = [
  { key: "background", label: "Nền trang" },
  { key: "foreground", label: "Chữ chính" },
  { key: "card", label: "Nền thẻ" },
  { key: "card-foreground", label: "Chữ trên thẻ" },
  { key: "primary", label: "Màu chính (nút chính)" },
  { key: "primary-foreground", label: "Chữ trên nút chính" },
  { key: "secondary", label: "Nền phụ" },
  { key: "secondary-foreground", label: "Chữ nền phụ" },
  { key: "muted", label: "Nền mờ" },
  { key: "muted-foreground", label: "Chữ mờ" },
  { key: "accent", label: "Màu nhấn" },
  { key: "accent-foreground", label: "Chữ trên nhấn" },
  { key: "border", label: "Viền" },
  { key: "input", label: "Viền input" },
  { key: "ring", label: "Focus ring" },
  { key: "destructive", label: "Màu báo lỗi" },
  { key: "display-accent", label: "Accent bảng hiển thị" },
  { key: "display-red", label: "Đỏ bảng hiển thị" },
];

export const CARD_STYLE_LABELS: { value: CardStyle; label: string }[] = [
  { value: "flat", label: "Phẳng" },
  { value: "sketch", label: "Nét vẽ tay" },
  { value: "riso", label: "In riso" },
  { value: "glass", label: "Kính mờ" },
  { value: "bca", label: "Cổng DVC (Công an)" },
];

export const BUTTON_STYLE_LABELS: { value: ButtonStyle; label: string }[] = [
  { value: "solid", label: "Đặc" },
  { value: "glass", label: "Kính mờ" },
  { value: "bca", label: "Đỏ Công an" },
];

export const CANVAS_STYLE_LABELS: { value: CanvasStyle; label: string }[] = [
  { value: "plain", label: "Trơn" },
  { value: "mesh", label: "Mesh pastel" },
  { value: "halftone", label: "Hạt in riso" },
  { value: "paper-radial", label: "Trống đồng xuyên nền" },
];

export const HEADER_STYLE_LABELS: { value: HeaderStyle; label: string }[] = [
  { value: "default", label: "Mặc định" },
  { value: "glass", label: "Kính mờ" },
  { value: "bca", label: "Đỏ Công an" },
  { value: "bca-transparent", label: "Trong suốt (nền xuyên qua)" },
];
