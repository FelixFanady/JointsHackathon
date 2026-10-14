import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { scopeFor } from "@/lib/supportArea";
import { PROVINCES } from "@/lib/provinces";
import { clean, sendNotices } from "@/lib/citizenNotice";
import { citizensAround } from "@/lib/reportNoticeServer";
import { createStatus, endStatus, loadStatus, loadStatuses } from "@/lib/areaStatus";
import { HAZARDS, SCOPE_ALL, STATUS_LEVELS, isHazard, isStatusLevel, scopeLabel, statusTitle } from "@/lib/areaStatusMeta";

export const dynamic = "force-dynamic";

/**
 * Status Wilayah (admin + support).
 * GET  -> { statuses, can_all, areas }   (an officer restricted to provinces sees "ALL" statuses + their provinces)
 * POST -> set a status   { scope: "ALL" | province, level, hazard, hazard_label?, message?, duration_hours?, notify? }
 * PATCH-> end a status   { id }
 */
export async function GET() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const scope = await scopeFor(g.user);
  const all = await loadStatuses();
  const statuses = scope === null ? all : all.filter((s) => s.scope === SCOPE_ALL || scope.has(s.scope));
  return NextResponse.json({ statuses, can_all: scope === null, areas: scope === null ? [...PROVINCES] : PROVINCES.filter((p) => scope.has(p)) });
}

export async function POST(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);
  const scope = await scopeFor(g.user);

  const area = typeof b?.scope === "string" ? b.scope : "";
  if (area === SCOPE_ALL) {
    if (scope !== null) return NextResponse.json({ error: "Status untuk seluruh wilayah hanya bisa dibuat oleh Admin atau petugas wilayah ALL." }, { status: 403 });
  } else if (!(PROVINCES as readonly string[]).includes(area)) {
    return NextResponse.json({ error: "Pilih wilayah." }, { status: 400 });
  } else if (scope !== null && !scope.has(area)) {
    return NextResponse.json({ error: "Wilayah ini di luar wilayah tugas Anda." }, { status: 403 });
  }
  if (!isStatusLevel(b?.level)) return NextResponse.json({ error: "Pilih tingkat status." }, { status: 400 });
  if (!isHazard(b?.hazard)) return NextResponse.json({ error: "Pilih jenis bencana." }, { status: 400 });
  const level = b.level;
  const hazard = b.hazard;
  const hazardLabel = hazard === "lainnya" ? clean(b?.hazard_label, 40) : HAZARDS.find((h) => h.key === hazard)!.label;
  if (hazardLabel.length < 3) return NextResponse.json({ error: "Tulis jenis bencananya (minimal 3 huruf)." }, { status: 400 });
  const message = clean(b?.message, 500);
  const hours = Number(b?.duration_hours);
  const endsAt = Number.isFinite(hours) && hours > 0 && hours <= 24 * 30 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
  const title = statusTitle(level, hazardLabel);

  // Optional push to the citizens in that area, so the status does not wait for them to open the app.
  let notified: number | null = null;
  if (b?.notify === true) {
    const targets =
      area === SCOPE_ALL
        ? [{ to: "all", to_name: null }]
        : (await citizensAround(0, 0, new Set([area]))).active.map((c) => ({ to: c.nik, to_name: c.full_name }));
    if (targets.length) {
      const err = await sendNotices(targets, {
        title: `${title} · ${scopeLabel(area)}`.slice(0, 80),
        message: message || STATUS_LEVELS.find((l) => l.key === level)!.desc,
        level: level === "waspada" ? "warning" : "danger",
        kind: level === "waspada" ? "umum" : "bencana", // siren only for Siaga / Awas
        source: "manual",
        target_label: `Status wilayah: ${scopeLabel(area)}`,
        by: g.user.full_name, by_id: g.user.id, by_username: g.user.username, by_role: g.user.role,
      });
      if (err) return NextResponse.json({ error: `Status belum disimpan: notifikasi gagal dikirim (${err}).` }, { status: 500 });
      notified = area === SCOPE_ALL ? -1 : targets.length; // -1 = broadcast to everyone
    } else {
      notified = 0;
    }
  }

  const r = await createStatus({
    scope: area, level, hazard, hazard_label: hazardLabel, title, message,
    created_at: new Date().toISOString(), ends_at: endsAt,
    by: g.user.full_name, by_id: g.user.id, by_username: g.user.username, by_role: g.user.role,
    notified, ended_at: null, ended_by: null, ended_reason: null,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ status: r.status, replaced: r.replaced }, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);
  const s = typeof b?.id === "string" ? await loadStatus(b.id) : null;
  if (!s) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });
  const scope = await scopeFor(g.user);
  if (scope !== null && (s.scope === SCOPE_ALL || !scope.has(s.scope))) {
    return NextResponse.json({ error: "Status ini di luar wilayah tugas Anda." }, { status: 403 });
  }
  if (s.ended_at) return NextResponse.json({ ok: true });
  const err = await endStatus(s, g.user.full_name);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ ok: true });
}
