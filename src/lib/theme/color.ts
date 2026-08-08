/** HSL triplet helpers — the theme tokens are stored as `H S% L%` triplets
 *  (optionally `/ alpha`) consumed via `hsl(var(--x))`. The builder edits
 *  them as hex, so we convert both ways. */

export function hslToHex(hsl: string): string {
  const input = hsl.trim();
  if (/^#([0-9a-f]{3,8})$/i.test(input)) return input.slice(0, 7);
  const match = input.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(\s*\/\s*[\d.]+)?$/);
  if (!match) return "#ffffff";
  const h = parseFloat(match[1]) % 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  const a = match[4] ? parseFloat(match[4].replace("/", "")) : 1;

  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(color * 255)
      .toString(16)
      .padStart(2, "0");
  };
  const hex = `#${f(0)}${f(8)}${f(4)}`;
  if (a >= 1) return hex;
  return hex + Math.round(a * 255).toString(16).padStart(2, "0");
}

export function hexToHsl(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;

  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
  }

  const base = `${Math.round(hue)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
  return alpha >= 1 ? base : `${base} / ${alpha}`;
}
