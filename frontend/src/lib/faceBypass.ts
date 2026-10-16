import "server-only";
import { db } from "./supabase";

const STAFF = "face_bypass:staff:";
const CITIZEN = "face_bypass:citizen:";

export type BypassKind = "staff" | "citizen";

export const bypassEnabled = () => process.env.FACE_BYPASS_ENABLED !== "0";

const prefixOf = (kind: BypassKind) => (kind === "staff" ? STAFF : CITIZEN);

export async function isBypassed(kind: BypassKind, id: string): Promise<boolean> {
  if (!bypassEnabled()) return false;
  try {
    const { data } = await db().from("settings").select("key").eq("key", prefixOf(kind) + id).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function bypassIds(kind: BypassKind): Promise<Set<string>> {
  const prefix = prefixOf(kind);
  const { data } = await db().from("settings").select("key").like("key", `${prefix}%`).limit(5000);
  return new Set((data ?? []).map((r) => String(r.key).slice(prefix.length)));
}

export async function setBypass(kind: BypassKind, id: string, on: boolean, by: string): Promise<boolean> {
  const key = prefixOf(kind) + id;
  if (!on) {
    const { error } = await db().from("settings").delete().eq("key", key);
    return !error;
  }
  const at = new Date().toISOString();
  const { error } = await db().from("settings").upsert({ key, value: { by, at }, updated_at: at }, { onConflict: "key" });
  return !error;
}
