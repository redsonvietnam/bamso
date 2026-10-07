import { describe, expect, it } from "vitest";
import {
  BUILTIN_FONT_IDS,
  googleFontFamily,
  fontStack,
  sansStack,
  googleFontUrl,
} from "../fonts";

describe("theme font helpers", () => {
  it("exposes the expected builtin font ids", () => {
    expect(BUILTIN_FONT_IDS).toEqual([
      "be-vietnam-pro",
      "oswald",
      "shantell",
      "space-grotesk",
      "jetbrains-mono",
    ]);
  });

  it("extracts Google font families only from google choices", () => {
    expect(googleFontFamily("google:Inter")).toBe("Inter");
    expect(googleFontFamily("google:Playfair Display")).toBe("Playfair Display");
    expect(googleFontFamily("inter")).toBeNull();
  });

  it("resolves builtin and Google font stacks", () => {
    expect(fontStack("oswald")).toBe("var(--font-oswald), var(--font-sans), sans-serif");
    expect(fontStack("google:Inter")).toBe("'Inter', var(--font-sans), sans-serif");
    expect(fontStack("custom-font")).toBe("'custom-font', var(--font-sans), sans-serif");
  });

  it("avoids self-referencing the sans variable", () => {
    expect(sansStack("google:Inter")).toBe("'Inter', ui-sans-serif, system-ui, sans-serif");
    expect(sansStack("be-vietnam-pro")).toBe("");
  });

  it("builds the Google Fonts stylesheet URL", () => {
    expect(googleFontUrl("Playfair Display")).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&display=swap"
    );
  });
});
