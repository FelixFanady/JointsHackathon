import "server-only";
import { db } from "./supabase";

/**
 * Notifications from Support to citizens, stored WITHOUT new tables: one row per
 * notice in the existing `settings` (key text, value jsonb) table, keyed
 *   notice:<nik | all>:<epoch-ms>-<rand>
 * `all` is a broadcast. Keys sort by time, so a prefix query + order gives the newest.
 */

export type NoticeLevel = "info" | "warning" | "danger";

export type Notice = {
  id: string; // full settings key
  to: string; // "all" or a NIK
  to_name: string | null;
  title: string;
  message: string;
  level: NoticeLevel;
  created_at: string;
  by: string; // sender display name
};

const PREFIX = "notice:";

export const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";

export async function sendNotices(
  targets: { to: string; to_name: string | null }[],
  n: { title: string; message: string; level: NoticeLevel; by: string },
): Promise<string | null> {
  const now = new Date();
  const stamp = String(now.getTime()).padStart(13, "0");
  const rows = targets.map((t, i) => {
    const id = `${PREFIX}${t.to}:${stamp}-${i.toString(36).padStart(3, "0")}${Math.random().toString(36).slice(2, 6)}`;
    const value: Omit<Notice, "id"> = {
      to: t.to,
      to_name: t.to_name,
      title: n.title,
      message: n.message,
      level: n.level,
      created_at: now.toISOString(),
      by: n.by,
    };
    return { key: id, value, updated_at: now.toISOString() };
  });
  const { error } = await db().from("settings").upsert(rows, { onConflict: "key" });
  return error ? error.message : null;
}

type Row = { key: string; value: unknown };
const toNotice = (r: Row): Notice => ({ ...(r.value as Omit<Notice, "id">), id: r.key });

/** Newest notices for one citizen: their own plus broadcasts. */
export async function noticesFor(nik: string, limit = 30): Promise<Notice[]> {
  const q = (p: string) =>
    db().from("settings").select("key,value").like("key", `${PREFIX}${p}:%`).order("key", { ascending: false }).limit(limit);
  const [a, b] = await Promise.all([q(nik), q("all")]);
  return [...(a.data ?? []), ...(b.data ?? [])]
    .map(toNotice)
    .sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at))
    .slice(0, limit);
}

/** Newest notices overall (Support history). */
export async function recentNotices(limit = 30): Promise<Notice[]> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`).order("key", { ascending: false }).limit(limit);
  return (data ?? []).map(toNotice).sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
}
