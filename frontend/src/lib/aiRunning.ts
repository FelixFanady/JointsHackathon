import "server-only";
import { db } from "./supabase";

/**
 * "AI is checking this report right now" markers, so every officer's screen can disable the
 * AI button and show progress (and nobody starts a second, duplicate check).
 * Stored in `settings` as `ai_running:<report id>`; a marker older than STALE_MS is ignored,
 * so a crashed check can never lock a report forever.
 */

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

/** Report ids with a fresh "AI running" marker. */
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
