import prisma from "@/lib/db";
import type { CustomTheme } from "./types";

const STORAGE_KEY = "custom_themes";

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

export async function saveCustomThemes(themes: CustomTheme[]): Promise<void> {
  await prisma.settings.upsert({
    where: { key: STORAGE_KEY },
    update: { value: JSON.stringify(themes) },
    create: { key: STORAGE_KEY, value: JSON.stringify(themes) },
  });
}
