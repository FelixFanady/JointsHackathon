import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { clean, noticeKind, type NoticeLevel } from "@/lib/citizenNotice";
import { DEFAULT_RADIUS_KM, NEARBY_RADIUS_OPTIONS_KM, NOTICE_MESSAGE_MAX, QUAKE_CATEGORIES, matchQuake } from "@/lib/reportNotice";
import { fetchBmkg } from "@/lib/ai";
import { citizensAround, loadNoticeLog, sendReportNotice } from "@/lib/reportNoticeServer";
import { reportsInScope } from "@/lib/reportRegion";
import { scopeFor } from "@/lib/supportArea";

export const dynamic = "force-dynamic";

/**
 * Support/admin: notify citizens about a VERIFIED report (SOS or citizen report).
 * Sent notices go through the same inbox the app polls (/api/mobile/notices), with a
 * `kind` that picks the sound on the phone. Every send is logged on the report.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rpt = { id: string; status: string; lat: number; lng: number; category: string; created_at: string };

async function loadReport(id: string): Promise<Rpt | null> {
  const { data } = await db().from("reports").select("id,status,lat,lng,category,created_at").eq("id", id).maybeSingle();
  return (data as Rpt | null) ?? null;
}

/** For quake / tsunami reports: the BMKG quake that matches it (same rule as the automatic triage), else null. */
async function quakeFor(r: Rpt) {
  if (!QUAKE_CATEGORIES.includes(r.category)) return null;
  return matchQuake(await fetchBmkg(r.lat, r.lng, 15), r.created_at);
}

/** GET ?id= -> { log, active, nearby: { "<km>": count }, quake } for the panel. */
export async function GET(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ID laporan tidak valid." }, { status: 400 });
  const r = await loadReport(id);
  if (!r) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
  const scope = await scopeFor(g.user);
  if (!(await reportsInScope(scope, [id]))) return NextResponse.json({ error: "Laporan di luar wilayah tugas Anda." }, { status: 403 });
  try {
    const [log, around, quake] = await Promise.all([loadNoticeLog(id), citizensAround(r.lat, r.lng, scope), quakeFor(r).catch(() => null)]);
    const nearby: Record<string, number> = {};
    for (const km of NEARBY_RADIUS_OPTIONS_KM) nearby[String(km)] = around.located.filter((c) => c.km <= km).length;
    return NextResponse.json({ log, active: around.activeCount, nearby, quake });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { id, scope: "nearby" | "all", radius_km?, kind, level?, title, message, force? }
 * Only for reports marked valid. Without `force`, a second send for the same report is refused (409)
 * so a double click cannot alarm everyone twice.
 */
export async function POST(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);

  const id = typeof b?.id === "string" ? b.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ID laporan tidak valid." }, { status: 400 });
  const scope: "nearby" | "all" = b?.scope === "all" ? "all" : "nearby";
  const radius = Number(b?.radius_km);
  const radiusKm = (NEARBY_RADIUS_OPTIONS_KM as readonly number[]).includes(radius) ? radius : DEFAULT_RADIUS_KM;
  const kind = noticeKind(b?.kind);
  const level: NoticeLevel = b?.level === "info" || b?.level === "warning" ? b.level : "danger";
  const title = clean(b?.title, 80);
  const message = clean(b?.message, NOTICE_MESSAGE_MAX);
  if (title.length < 2) return NextResponse.json({ error: "Judul minimal 2 karakter." }, { status: 400 });
  if (message.length < 2) return NextResponse.json({ error: "Isi pesan minimal 2 karakter." }, { status: 400 });

  const r = await loadReport(id);
  if (!r) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
  const area = await scopeFor(g.user);
  if (!(await reportsInScope(area, [id]))) return NextResponse.json({ error: "Laporan di luar wilayah tugas Anda." }, { status: 403 });
  if (r.status !== "valid") return NextResponse.json({ error: "Tandai laporan sebagai Valid dulu sebelum mengirim notifikasi." }, { status: 409 });

  const log = await loadNoticeLog(id);
  if (log.length > 0 && b?.force !== true) {
    return NextResponse.json({ error: "Notifikasi untuk laporan ini sudah pernah dikirim.", already: true, log }, { status: 409 });
  }
  // Guard against an accidental double send (double click / two tabs): same kind + scope within 60 s.
  const last = log[log.length - 1];
  if (last && last.kind === kind && last.scope === scope && Date.now() - Date.parse(last.sent_at) < 60_000) {
    return NextResponse.json({ error: "Notifikasi yang sama baru saja dikirim. Tunggu 1 menit jika memang ingin mengirim ulang.", log }, { status: 429 });
  }

  const res = await sendReportNotice(r, { scope, radiusKm, kind, level, title, message, by: g.user.full_name, by_id: g.user.id, by_username: g.user.username, by_role: g.user.role, scopeProvinces: area });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ sent: res.recipients, scope, radius_km: scope === "nearby" ? radiusKm : null, log: res.log }, { status: 201 });
}
