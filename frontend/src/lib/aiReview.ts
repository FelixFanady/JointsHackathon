import "server-only";
import { db } from "./supabase";


export type AiReview = { ok: boolean; by: string; at: string };
const PREFIX = "ai_review:";

export async function loadAiReviews(): Promise<Map<string, AiReview>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out = new Map<string, AiReview>();
  for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as AiReview);
  return out;
}

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
