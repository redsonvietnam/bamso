import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/theme/presets", () => ({ PRESET_THEMES: [] }));
vi.mock("@/lib/theme/store", () => ({
  getCustomThemes: vi.fn(),
  saveCustomThemes: vi.fn(),
  ThemeConflictError: class ThemeConflictError extends Error {},
}));

import { POST, PUT } from "@/app/api/themes/route";
import { getCustomThemes, saveCustomThemes } from "@/lib/theme/store";
import { ThemeConflictError } from "@/lib/theme/store";

const mockedGetCustomThemes = vi.mocked(getCustomThemes);
const mockedSaveCustomThemes = vi.mocked(saveCustomThemes);

const validTheme = {
  name: "Test Theme",
  colors: { primary: "222 68% 25%" },
  fontSans: "Inter",
  fontDisplay: "Inter",
  radius: "0.5rem",
  cardStyle: "flat",
  buttonStyle: "solid",
  canvasStyle: "plain",
  headerStyle: "default",
};

function request(body: unknown, method: "POST" | "PUT" = "POST") {
  return new Request("http://localhost/api/themes", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetCustomThemes.mockResolvedValue([]);
  mockedSaveCustomThemes.mockResolvedValue(undefined);
});

describe("Theme API runtime validation", () => {
  it.each([
    ["unknown cardStyle", { cardStyle: "evil" }],
    ["unknown buttonStyle", { buttonStyle: "evil" }],
    ["unknown canvasStyle", { canvasStyle: "evil" }],
    ["unknown headerStyle", { headerStyle: "evil" }],
    ["colors array", { colors: [] }],
    ["unknown color token", { colors: { madeUp: "red" } }],
    ["non-string color", { colors: { primary: 123 } }],
    ["malformed color", { colors: { primary: "not-a-color" } }],
    ["malformed color syntax", { colors: { primary: "222 68%" } }],
    ["invalid alpha", { colors: { primary: "222 68% 25% / 2" } }],
    ["hex on non-display token", { colors: { primary: "#C9A227" } }],
    ["empty fontSans", { fontSans: "   " }],
    ["empty radius", { radius: "" }],
    ["non-string id", { id: 123 }],
  ])("rejects %s", async (_label, patch) => {
    const response = await POST(request({ ...validTheme, ...patch }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });

  it("accepts valid HSL with alpha", async () => {
    const response = await POST(
      request({
        ...validTheme,
        colors: { primary: "226 60% 97% / 0.35" },
      })
    );

    expect(response.status).toBe(201);
    expect(mockedSaveCustomThemes).toHaveBeenCalledOnce();
  });

  it("accepts valid hex colors for display tokens", async () => {
    const response = await POST(
      request({
        ...validTheme,
        colors: {
          "display-accent": "#C9A227",
          "display-red": "#C8102E",
        },
      })
    );

    expect(response.status).toBe(201);
    expect(mockedSaveCustomThemes).toHaveBeenCalledOnce();
  });

  it("accepts a valid payload and persists it", async () => {
    const response = await POST(request(validTheme));
    expect(response.status).toBe(201);
    expect(mockedSaveCustomThemes).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      name: "Test Theme",
      builtIn: false,
      cardStyle: "flat",
      buttonStyle: "solid",
      canvasStyle: "plain",
      headerStyle: "default",
    });
  });

  it("imports a valid theme batch atomically", async () => {
    const first = { ...validTheme, id: "theme-first" };
    const second = { ...validTheme, id: "theme-second", name: "Second Theme" };

    const response = await POST(request({ themes: [first, second] }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toHaveLength(2);
    expect(mockedSaveCustomThemes).toHaveBeenCalledOnce();
    expect(mockedSaveCustomThemes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "theme-first" }),
        expect.objectContaining({ id: "theme-second" }),
      ]),
      []
    );
  });

  it("rejects the entire import batch when one theme is invalid", async () => {
    const response = await POST(
      request({
        themes: [
          { ...validTheme, id: "valid-theme" },
          { ...validTheme, id: "invalid-theme", colors: { primary: "not-a-color" } },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME_IMPORT" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs in an import batch without persisting any theme", async () => {
    const response = await POST(
      request({
        themes: [
          { ...validTheme, id: "same-id" },
          { ...validTheme, id: "same-id", name: "Second Theme" },
        ],
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_ID" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });

  it("applies defaults for optional style fields", async () => {
    const payload = { ...validTheme };
    delete (payload as Partial<typeof payload>).cardStyle;
    delete (payload as Partial<typeof payload>).buttonStyle;
    delete (payload as Partial<typeof payload>).canvasStyle;
    delete (payload as Partial<typeof payload>).headerStyle;

    const response = await POST(request(payload));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      cardStyle: "flat",
      buttonStyle: "solid",
      canvasStyle: "plain",
      headerStyle: "default",
    });
  });

  it("rejects malformed color on PUT without persisting", async () => {
    const existing = { id: "theme-1", ...validTheme };
    mockedGetCustomThemes.mockResolvedValue([existing]);

    const response = await PUT(
      request({ ...existing, colors: { primary: "not-a-color" } }, "PUT")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });

  it("validates PUT payloads with the same runtime rules", async () => {
    const existing = { id: "theme-1", ...validTheme };
    mockedGetCustomThemes.mockResolvedValue([existing]);

    const response = await PUT(request({ ...existing, colors: { unknown: "222 68% 25%" } }, "PUT"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });

  it("returns 409 and does not persist when PUT loses the update race", async () => {
    const existing = { id: "theme-1", ...validTheme };
    mockedGetCustomThemes.mockResolvedValue([existing]);
    mockedSaveCustomThemes.mockRejectedValue(new ThemeConflictError());

    const response = await PUT(request({ ...existing, name: "Updated" }, "PUT"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "THEME_CONFLICT" });
    expect(mockedSaveCustomThemes).toHaveBeenCalledWith(
      [{ ...existing, name: "Updated", builtIn: false }],
      [existing]
    );
  });
});
