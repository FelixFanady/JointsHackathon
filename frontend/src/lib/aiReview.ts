import "server-only";
import { db } from "./supabase";

/**
 * Human review of the AI's automatic validation ("Valid · Perlu ditinjau" -> Valid / Palsu).
 * Records whether the officer found the AI right, so the console can show it and AI accuracy
 * can be measured later. Stored in `settings` as `ai_review:<report id>`.
 */

export type AiReview = { ok: boolean; by: string; at: string };
const PREFIX = "ai_review:";

export async function loadAiReviews(): Promise<Map<string, AiReview>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out = new Map<string, AiReview>();
  for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as AiReview);
  return out;
}

/** Call BEFORE updating the status: reports that were auto-validated (valid, no reviewer) get a review record. */
export async function recordAiReview(ids: string[], decision: "valid" | "false", by: string): Promise<void> {
  const { data } = await db().from("reports").select("id,status,reviewed_by").in("id", ids);
  const auto = (data ?? []).filter((r) => r.status === "valid" && !r.reviewed_by);
  if (!auto.length) return;
  const at = new Date().toISOString();
  await db()
    .from("settings")
    .upsert(auto.map((r) => ({ key: PREFIX + r.id, value: { ok: decision === "valid", by, at }, updated_at: at })), { onConflict: "key" })
    .then(() => undefined, () => undefined);
}
