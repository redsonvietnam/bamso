import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  default: {
    settings: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      updateMany: mockUpdateMany,
      create: mockCreate,
    },
  },
}));

import { ThemeConflictError, saveCustomThemes } from "@/lib/theme/store";

const themes = [
  {
    id: "theme-1",
    name: "Theme 1",
    builtIn: false,
    colors: { primary: "222 68% 25%" },
    fontSans: "Inter",
    fontDisplay: "Inter",
    radius: "0.5rem",
    cardStyle: "flat" as const,
    buttonStyle: "solid" as const,
    canvasStyle: "plain" as const,
    headerStyle: "default" as const,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveCustomThemes optimistic locking", () => {
  it("updates only when stored value still matches the expected snapshot", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await saveCustomThemes([...themes], []);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { key: "custom_themes", value: "[]" },
      data: { value: JSON.stringify(themes) },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws ThemeConflictError when the expected snapshot is stale", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(saveCustomThemes([...themes], [
      { ...themes[0], name: "Old" },
    ])).rejects.toBeInstanceOf(ThemeConflictError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the first value when the expected snapshot is empty", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue(themes[0]);

    await saveCustomThemes([...themes], []);

    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "custom_themes", value: JSON.stringify(themes) },
    });
  });

  it("turns a concurrent first-write unique conflict into ThemeConflictError", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockRejectedValue({ code: "P2002" });

    await expect(saveCustomThemes([...themes], [])).rejects.toBeInstanceOf(ThemeConflictError);
  });
});
