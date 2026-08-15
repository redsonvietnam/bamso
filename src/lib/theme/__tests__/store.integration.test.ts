import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/db";
import { ThemeConflictError, getCustomThemes, saveCustomThemes } from "@/lib/theme/store";

const describeIntegration = process.env.THEME_DB_INTEGRATION === "1" ? describe : describe.skip;

const theme = (name: string) => [
  {
    id: `theme-${name.toLowerCase()}`,
    name,
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

describeIntegration("saveCustomThemes SQLite concurrency integration", () => {
  let originalValue: string | null | undefined;

  beforeAll(async () => {
    const existing = await prisma.settings.findUnique({ where: { key: "custom_themes" } });
    originalValue = existing?.value;
    await prisma.settings.deleteMany({ where: { key: "custom_themes" } });
  });

  afterAll(async () => {
    await prisma.settings.deleteMany({ where: { key: "custom_themes" } });
    if (originalValue !== undefined) {
      await prisma.settings.create({
        data: { key: "custom_themes", value: originalValue },
      });
    }
    await prisma.$disconnect();
  });

  it("allows only one of two concurrent writers with the same snapshot", async () => {
    const expected = theme("Base");
    await saveCustomThemes(expected);

    const [resultA, resultB] = await Promise.allSettled([
      saveCustomThemes(theme("Writer A"), expected),
      saveCustomThemes(theme("Writer B"), expected),
    ]);

    const fulfilled = [resultA, resultB].filter(
      (result): result is PromiseFulfilledResult<void> => result.status === "fulfilled"
    );
    const conflicts = [resultA, resultB].filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && result.reason instanceof ThemeConflictError
    );

    expect(fulfilled).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(["Writer A", "Writer B"]).toContain((await getCustomThemes())[0]?.name);
  });

  it("allows only one concurrent first writer when no row exists", async () => {
    await prisma.settings.deleteMany({ where: { key: "custom_themes" } });

    const [resultA, resultB] = await Promise.allSettled([
      saveCustomThemes(theme("First A"), []),
      saveCustomThemes(theme("First B"), []),
    ]);

    const fulfilled = [resultA, resultB].filter(
      (result): result is PromiseFulfilledResult<void> => result.status === "fulfilled"
    );
    const conflicts = [resultA, resultB].filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && result.reason instanceof ThemeConflictError
    );

    expect(fulfilled).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(["First A", "First B"]).toContain((await getCustomThemes())[0]?.name);
  });
});
