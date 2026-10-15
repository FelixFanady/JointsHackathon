import "server-only";
import { db } from "./supabase";
import { DEFAULT_SETTINGS, type Settings } from "./types";

export async function loadSettings(): Promise<Settings> {
  const { data } = await db().from("settings").select("key,value").in("key", Object.keys(DEFAULT_SETTINGS));
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (row.key in out && typeof row.value === "number") (out as Record<string, number>)[row.key] = row.value;
  }
  return out;
}
