import { describe, expect, it } from "vitest";
import { hslToHex, hexToHsl } from "../color";

describe("theme color conversion", () => {
  it("converts primary colors between HSL and hex", () => {
    expect(hslToHex("0 100% 50%")).toBe("#ff0000");
    expect(hslToHex("120 100% 50%")).toBe("#00ff00");
    expect(hslToHex("240 100% 50%")).toBe("#0000ff");

    expect(hexToHsl("#ff0000")).toBe("0 100% 50%");
    expect(hexToHsl("#00ff00")).toBe("120 100% 50%");
    expect(hexToHsl("#0000ff")).toBe("240 100% 50%");
  });

  it("preserves valid shorthand hex input", () => {
    expect(hslToHex("#fff")).toBe("#fff");
    expect(hslToHex("#abc")).toBe("#abc");
    expect(hslToHex("#abcd")).toBe("#abcd");
  });

  it("preserves alpha when converting HSL to hex", () => {
    expect(hslToHex("0 100% 50% / 0.5")).toBe("#ff000080");
    expect(hslToHex("210 50% 40% / 0.25")).toBe("#33669940");
  });

  it("falls back safely for malformed HSL input", () => {
    expect(hslToHex("not-a-color")).toBe("#ffffff");
    expect(hslToHex("")).toBe("#ffffff");
  });
});
