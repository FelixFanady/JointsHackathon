import "server-only";
import { db } from "./supabase";
import { ALL_AREAS, PROVINCES, normalizeProvince } from "./provinces";
import type { Profile } from "./types";

/**
 * Which provinces a Support officer is assigned to. Stored WITHOUT altering `profiles`:
 * one `settings` row per officer, key `support_area:<profile id>`, value { areas: string[] }.
 * - Admins always see everything.
 * - An officer with no row yet sees everything (so existing accounts keep working until an admin assigns them).
 * - "ALL" = whole world, including reports outside Indonesia or whose area is still unknown.
 */

const PREFIX = "support_area:";

export async function loadAreas(profileId: string): Promise<string[]> {
  const { data } = await db().from("settings").select("value").eq("key", PREFIX + profileId).maybeSingle();
  const v = data?.value as { areas?: unknown } | null;
  if (!v || !Array.isArray(v.areas)) return [ALL_AREAS];
  return cleanAreas(v.areas);
}

export async function loadAllAreas(): Promise<Record<string, string[]>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out: Record<string, string[]> = {};
  for (const r of data ?? []) {
    const v = r.value as { areas?: unknown } | null;
    if (typeof r.key === "string" && Array.isArray(v?.areas)) out[r.key.slice(PREFIX.length)] = cleanAreas(v.areas);
  }
  return out;
}

/** Keep only "ALL" or valid province names. */
export function cleanAreas(list: unknown[]): string[] {
  if (list.includes(ALL_AREAS)) return [ALL_AREAS];
  const valid = new Set<string>(PROVINCES);
  return [...new Set(list.filter((p): p is string => typeof p === "string" && valid.has(p)))];
}

export async function saveAreas(profileId: string, areas: string[]): Promise<string | null> {
  const now = new Date().toISOString();
  const { error } = await db().from("settings").upsert({ key: PREFIX + profileId, value: { areas: cleanAreas(areas) }, updated_at: now }, { onConflict: "key" });
  return error ? error.message : null;
}

export async function deleteAreas(profileId: string): Promise<void> {
  await db().from("settings").delete().eq("key", PREFIX + profileId);
}

/** What the caller may see: null = everything, otherwise the set of allowed provinces (possibly empty). */
export type Scope = Set<string> | null;

export async function scopeFor(user: Profile): Promise<Scope> {
  if (user.role === "admin") return null;
  const areas = await loadAreas(user.id);
  return areas.includes(ALL_AREAS) ? null : new Set(areas);
}

/** Is a place (by its street-map province name) inside the caller's scope? Unknown places only for "ALL". */
export function inScope(scope: Scope, provinceName: string | null | undefined): boolean {
  if (scope === null) return true;
  const p = normalizeProvince(provinceName);
  return !!p && scope.has(p);
}
