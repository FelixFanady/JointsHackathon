import "server-only";
import { db } from "./supabase";
import { isActive, type AreaStatus } from "./areaStatusMeta";

/**
 * Storage for "Status Wilayah" in the `settings` table: one row per status, key
 * `area_status:<13-digit epoch>-<rand>` (so key order = creation order). Not personal data, so not encrypted.
 * Ending a status keeps the row (ended_at / ended_by) as the audit trail.
 */

const PREFIX = "area_status:";

export async function loadStatuses(limit = 300): Promise<AreaStatus[]> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`).order("key", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({ ...(r.value as Omit<AreaStatus, "id">), id: r.key as string }));
}

export async function loadStatus(id: string): Promise<AreaStatus | null> {
  if (!id.startsWith(PREFIX)) return null;
  const { data } = await db().from("settings").select("key,value").eq("key", id).maybeSingle();
  return data ? { ...(data.value as Omit<AreaStatus, "id">), id: data.key as string } : null;
}

async function write(s: AreaStatus): Promise<string | null> {
  const { id, ...value } = s;
  const { error } = await db().from("settings").upsert({ key: id, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message : null;
}

/** Save a new status. A still-active status for the same area + hazard is ended as "replaced" (e.g. Waspada -> Siaga). */
export async function createStatus(s: Omit<AreaStatus, "id">): Promise<{ status: AreaStatus; replaced: number } | { error: string }> {
  const now = new Date();
  const id = `${PREFIX}${String(now.getTime()).padStart(13, "0")}-${Math.random().toString(36).slice(2, 8)}`;
  const status: AreaStatus = { ...s, id };
  const err = await write(status);
  if (err) return { error: err };
  let replaced = 0;
  for (const old of await loadStatuses()) {
    if (old.id === id || !isActive(old) || old.scope !== s.scope || old.hazard !== s.hazard) continue;
    if (s.hazard === "lainnya" && old.hazard_label.toLowerCase() !== s.hazard_label.toLowerCase()) continue;
    await write({ ...old, ended_at: now.toISOString(), ended_by: s.by, ended_reason: "replaced" });
    replaced++;
  }
  return { status, replaced };
}

export async function endStatus(s: AreaStatus, by: string): Promise<string | null> {
  return write({ ...s, ended_at: new Date().toISOString(), ended_by: by, ended_reason: "manual" });
}
