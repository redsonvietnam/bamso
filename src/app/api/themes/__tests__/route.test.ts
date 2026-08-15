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
}));

import { POST, PUT } from "@/app/api/themes/route";
import { getCustomThemes, saveCustomThemes } from "@/lib/theme/store";

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
    ["empty fontSans", { fontSans: "   " }],
    ["empty radius", { radius: "" }],
    ["non-string id", { id: 123 }],
  ])("rejects %s", async (_label, patch) => {
    const response = await POST(request({ ...validTheme, ...patch }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
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

  it("validates PUT payloads with the same runtime rules", async () => {
    const existing = { id: "theme-1", ...validTheme };
    mockedGetCustomThemes.mockResolvedValue([existing]);

    const response = await PUT(request({ ...existing, colors: { unknown: "x" } }, "PUT"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_THEME" });
    expect(mockedSaveCustomThemes).not.toHaveBeenCalled();
  });
});
