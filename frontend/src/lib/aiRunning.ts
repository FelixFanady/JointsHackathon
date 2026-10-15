import "server-only";
import { db } from "./supabase";


const PREFIX = "ai_running:";
const STALE_MS = 3 * 60_000;

export async function markAiRunning(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const at = new Date().toISOString();
  await db()
    .from("settings")
    .upsert(ids.map((id) => ({ key: PREFIX + id, value: { at }, updated_at: at })), { onConflict: "key" })
    .then(() => undefined, () => undefined);
}

export async function clearAiRunning(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db()
    .from("settings")
    .delete()
    .in("key", ids.map((id) => PREFIX + id))
    .then(() => undefined, () => undefined);
}

export async function loadAiRunning(): Promise<Set<string>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const now = Date.now();
  const out = new Set<string>();
  for (const row of data ?? []) {
    const at = Date.parse((row.value as { at?: string } | null)?.at ?? "");
    if (typeof row.key === "string" && Number.isFinite(at) && now - at < STALE_MS) out.add(row.key.slice(PREFIX.length));
  }
  return out;
}
