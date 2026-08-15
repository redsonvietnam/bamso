import prisma from "@/lib/db";
import type { CustomTheme } from "./types";

const STORAGE_KEY = "custom_themes";

export class ThemeConflictError extends Error {
  constructor() {
    super("Theme data changed since it was read");
    this.name = "ThemeConflictError";
  }
}

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const row = await prisma.settings.findUnique({ where: { key: STORAGE_KEY } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as CustomTheme[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomThemes(
  themes: CustomTheme[],
  expectedThemes?: CustomTheme[]
): Promise<void> {
  const nextValue = JSON.stringify(themes);

  if (expectedThemes === undefined) {
    await prisma.settings.upsert({
      where: { key: STORAGE_KEY },
      update: { value: nextValue },
      create: { key: STORAGE_KEY, value: nextValue },
    });
    return;
  }

  const expectedValue = JSON.stringify(expectedThemes);
  const updated = await prisma.settings.updateMany({
    where: { key: STORAGE_KEY, value: expectedValue },
    data: { value: nextValue },
  });

  if (updated.count === 1) return;

  if (expectedThemes.length === 0) {
    try {
      await prisma.settings.create({
        data: { key: STORAGE_KEY, value: nextValue },
      });
      return;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ThemeConflictError();
      }
      throw error;
    }
  }

  throw new ThemeConflictError();
}
