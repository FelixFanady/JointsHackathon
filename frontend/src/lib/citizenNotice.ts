import "server-only";
import { db } from "./supabase";
import { pushNotice } from "./push";


export type NoticeLevel = "info" | "warning" | "danger";
export type NoticeKind = "bencana" | "kriminal" | "umum";
export const noticeKind = (v: unknown): NoticeKind => (v === "bencana" || v === "kriminal" ? v : "umum");

export type Notice = {
  id: string;
  to: string;
  to_name: string | null;
  title: string;
  message: string;
  level: NoticeLevel;
  kind?: NoticeKind;
  created_at: string;
  by: string;
  batch?: string;
  by_id?: string | null;
  by_username?: string | null;
  by_role?: string | null;
  target_label?: string;
  source?: "manual" | "report" | "auto";
  report_id?: string;
  photo_url?: string;
};

export type NoticeSender = { by: string; by_id?: string | null; by_username?: string | null; by_role?: string | null };

const PREFIX = "notice:";

export const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";

export async function sendNotices(
  targets: { to: string; to_name: string | null }[],
  n: { title: string; message: string; level: NoticeLevel; kind: NoticeKind; target_label?: string; source?: Notice["source"]; report_id?: string; photo_url?: string | null } & NoticeSender,
): Promise<string | null> {
  const now = new Date();
  const stamp = String(now.getTime()).padStart(13, "0");
  const batch = `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = targets.map((t, i) => {
    const id = `${PREFIX}${t.to}:${stamp}-${i.toString(36).padStart(3, "0")}${Math.random().toString(36).slice(2, 6)}`;
    const value: Omit<Notice, "id"> = {
      to: t.to,
      to_name: t.to_name,
      title: n.title,
      message: n.message,
      level: n.level,
      kind: n.kind,
      created_at: now.toISOString(),
      by: n.by,
      batch,
      by_id: n.by_id ?? null,
      by_username: n.by_username ?? null,
      by_role: n.by_role ?? null,
      ...(n.target_label ? { target_label: n.target_label } : {}),
      source: n.source ?? "manual",
      ...(n.report_id ? { report_id: n.report_id } : {}),
      ...(n.photo_url ? { photo_url: n.photo_url } : {}),
    };
    return { key: id, value, updated_at: now.toISOString() };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("settings").upsert(rows.slice(i, i + 500), { onConflict: "key" });
    if (error) return error.message;
  }
  await pushNotice(
    {
      title: n.title,
      message: n.message,
      level: n.level,
      kind: n.kind,
      created_at: now.toISOString(),
      photo_url: n.photo_url ?? null,
      report_id: n.report_id ?? null,
    },
    rows.map((r) => ({ to: r.value.to, id: r.key })),
  );
  return null;
}

type Row = { key: string; value: unknown };
const toNotice = (r: Row): Notice => ({ ...(r.value as Omit<Notice, "id">), id: r.key });

export async function noticesFor(nik: string, limit = 30): Promise<Notice[]> {
  const q = (p: string) =>
    db().from("settings").select("key,value").like("key", `${PREFIX}${p}:%`).order("key", { ascending: false }).limit(limit);
  const [a, b] = await Promise.all([q(nik), q("all")]);
  return [...(a.data ?? []), ...(b.data ?? [])]
    .map(toNotice)
    .sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at))
    .slice(0, limit);
}

export async function recentNotices(limit = 30): Promise<Notice[]> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`).order("updated_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toNotice).sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
}
