import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { clean, noticeKind, recentNotices, sendNotices, type Notice, type NoticeLevel } from "@/lib/citizenNotice";
import { citizensAround } from "@/lib/reportNoticeServer";
import { scopeFor } from "@/lib/supportArea";

export const dynamic = "force-dynamic";

const MESSAGE_MAX = 800;

type Batch = {
  id: string;
  title: string;
  message: string;
  level: NoticeLevel;
  kind: Notice["kind"] | null;
  created_at: string;
  by: string;
  by_username: string | null;
  by_role: string | null;
  source: NonNullable<Notice["source"]>;
  to_all: boolean;
  recipients: number;
  to_names: string[];
  target_label: string | null;
  photo_url: string | null;
};

function toBatches(rows: Notice[]): Batch[] {
  const m = new Map<string, Batch>();
  for (const n of rows) {
    const key = n.batch ?? `${n.created_at}|${n.title}|${n.by}`;
    let b = m.get(key);
    if (!b) {
      b = {
        id: key, title: n.title, message: n.message, level: n.level, kind: n.kind ?? null, created_at: n.created_at,
        by: n.by, by_username: n.by_username ?? null, by_role: n.by_role ?? null, source: n.source ?? "manual",
        to_all: false, recipients: 0, to_names: [], target_label: n.target_label ?? null, photo_url: n.photo_url ?? null,
      };
      m.set(key, b);
    }
    if (n.to === "all") b.to_all = true;
    else {
      b.recipients++;
      if (b.to_names.length < 5 && n.to_name) b.to_names.push(n.to_name);
    }
  }
  return [...m.values()].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export async function GET() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const rows = await recentNotices(3000);
  const area = await scopeFor(g.user);
  const mine = (n: Notice) => (n.by_id ? n.by_id === g.user.id : n.by === g.user.full_name);
  return NextResponse.json({ notices: toBatches(area === null ? rows : rows.filter(mine)), scope: area === null ? "all" : "own" });
}

export async function POST(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);

  const title = clean(b?.title, 80);
  const message = clean(b?.message, MESSAGE_MAX);
  const level: NoticeLevel = b?.level === "warning" || b?.level === "danger" ? b.level : "info";
  const kind = noticeKind(b?.kind);
  const targetLabel = clean(b?.target_label, 120) || undefined;
  if (title.length < 2) return NextResponse.json({ error: "Judul minimal 2 karakter." }, { status: 400 });
  if (message.length < 2) return NextResponse.json({ error: "Isi pesan minimal 2 karakter." }, { status: 400 });

  const area = await scopeFor(g.user);
  const areaCitizens = area === null ? null : (await citizensAround(0, 0, area)).active;
  const inArea = areaCitizens === null ? null : new Set(areaCitizens.map((c) => c.nik));

  let targets: { to: string; to_name: string | null }[];
  if (b?.targets === "all") {
    if (areaCitizens === null) targets = [{ to: "all", to_name: null }];
    else {
      targets = areaCitizens.map((c) => ({ to: c.nik, to_name: c.full_name }));
      if (!targets.length) return NextResponse.json({ error: "Belum ada warga aktif di wilayah tugas Anda." }, { status: 400 });
    }
  } else if (Array.isArray(b?.targets) && b.targets.length > 0 && b.targets.length <= 2000) {
    const niks = [...new Set(b.targets as unknown[])];
    if (!niks.every((n) => typeof n === "string" && /^\d{16}$/.test(n))) {
      return NextResponse.json({ error: "NIK penerima tidak valid." }, { status: 400 });
    }
    if (inArea && !niks.every((n) => inArea.has(n as string))) {
      return NextResponse.json({ error: "Sebagian penerima berada di luar wilayah tugas Anda." }, { status: 403 });
    }
    const found: { nik: string; full_name: string; active: boolean }[] = [];
    for (let i = 0; i < niks.length; i += 200) {
      const { data, error } = await db().from("citizens").select("nik,full_name,active").in("nik", niks.slice(i, i + 200) as string[]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      found.push(...((data ?? []) as typeof found));
    }
    targets = found.filter((c) => c.active).map((c) => ({ to: c.nik, to_name: c.full_name }));
    if (!targets.length) return NextResponse.json({ error: "Tidak ada penerima aktif." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Pilih penerima." }, { status: 400 });
  }

  const err = await sendNotices(targets, {
    title, message, level, kind, source: "manual",
    target_label: targetLabel ?? (b?.targets === "all" ? (inArea === null ? "Semua warga" : "Semua warga di wilayah tugas") : `${targets.length} warga dipilih`),
    by: g.user.full_name, by_id: g.user.id, by_username: g.user.username, by_role: g.user.role,
  });
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ sent: targets.length, broadcast: b?.targets === "all" && inArea === null }, { status: 201 });
}
