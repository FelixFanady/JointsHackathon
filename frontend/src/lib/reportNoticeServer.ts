import "server-only";
import { db } from "./supabase";
import { loadAllActivity } from "./citizenActivity";
import { loadAllProfiles } from "./citizenProfile";
import { sendNotices, type NoticeKind, type NoticeLevel } from "./citizenNotice";
import { distanceKm, type ReportNoticeLog } from "./reportNotice";
import { inScope, type Scope } from "./supportArea";

/**
 * Server side of "notify citizens about a verified report", shared by the officer's
 * panel (/api/reports/notify) and the automatic AI + BMKG triage (lib/autoTriage.ts).
 * Sends are logged per report in `settings` under `report_notice:<report id>`.
 */

const logKey = (id: string) => `report_notice:${id}`;

export async function loadNoticeLog(reportId: string): Promise<ReportNoticeLog[]> {
  const { data } = await db().from("settings").select("value").eq("key", logKey(reportId)).maybeSingle();
  const v = data?.value as { logs?: ReportNoticeLog[] } | null;
  return Array.isArray(v?.logs) ? v.logs : [];
}

export async function appendNoticeLog(reportId: string, entry: ReportNoticeLog): Promise<ReportNoticeLog[]> {
  const logs = [...(await loadNoticeLog(reportId)), entry];
  // Logging is secondary: the notices are already out, so a failure here must not fail the send.
  await db()
    .from("settings")
    .upsert({ key: logKey(reportId), value: { logs }, updated_at: entry.sent_at }, { onConflict: "key" })
    .then(() => undefined, () => undefined);
  return logs;
}

/** Active citizens with their last known GPS point and distance (km) to (lat,lng).
 *  With a province `scope` (restricted Support officer), only citizens whose last known area is inside it. */
export async function citizensAround(lat: number, lng: number, scope: Scope = null) {
  const [{ data, error }, activity, profiles] = await Promise.all([
    db().from("citizens").select("nik,full_name,active").eq("active", true).limit(5000),
    loadAllActivity(),
    scope === null ? Promise.resolve({} as Awaited<ReturnType<typeof loadAllProfiles>>) : loadAllProfiles(),
  ]);
  if (error) throw new Error(error.message);
  // A citizen's area = last GPS area, else the area of their profile address (same rule as the Users page).
  const provinceOf = (nik: string) => activity[nik]?.region?.province ?? profiles[nik]?.geo?.province ?? null;
  const active = (data ?? []).filter((c) => scope === null || inScope(scope, provinceOf(c.nik)));
  const located = active.flatMap((c) => {
    const a = activity[c.nik];
    if (a?.last_lat == null || a?.last_lng == null) return [];
    return [{ nik: c.nik as string, full_name: c.full_name as string, km: distanceKm(lat, lng, a.last_lat, a.last_lng) }];
  });
  return { activeCount: active.length, active: active.map((c) => ({ nik: c.nik as string, full_name: c.full_name as string })), located };
}

export type SendPlan = {
  scope: "nearby" | "all";
  radiusKm: number;
  kind: NoticeKind;
  level: NoticeLevel;
  title: string;
  message: string;
  by: string;
  by_id?: string | null;
  by_username?: string | null;
  by_role?: string | null;
  auto?: boolean;
  note?: string;
  /** Restricted officer: "all" means every citizen in these provinces, nearby is limited to them too. */
  scopeProvinces?: Scope;
};

/** Send the notification for one report and log it. */
export async function sendReportNotice(
  report: { id: string; lat: number; lng: number },
  plan: SendPlan,
): Promise<{ ok: true; recipients: number; log: ReportNoticeLog[] } | { ok: false; error: string; status: number }> {
  let targets: { to: string; to_name: string | null }[];
  let recipients: number;
  const scope = plan.scopeProvinces ?? null;
  try {
    const around = await citizensAround(report.lat, report.lng, scope);
    if (plan.scope === "all") {
      // Unrestricted: one broadcast row. Restricted: one row per citizen in the assigned provinces.
      targets = scope === null ? [{ to: "all", to_name: null }] : around.active.map((c) => ({ to: c.nik, to_name: c.full_name }));
      recipients = around.activeCount;
      if (!recipients) return { ok: false, error: "Belum ada warga aktif di wilayah tugas Anda.", status: 400 };
    } else {
      targets = around.located.filter((c) => c.km <= plan.radiusKm).map((c) => ({ to: c.nik, to_name: c.full_name }));
      recipients = targets.length;
      if (!targets.length) return { ok: false, error: `Tidak ada warga dengan lokasi terakhir dalam radius ${plan.radiusKm} km.`, status: 400 };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, status: 500 };
  }

  const err = await sendNotices(targets, {
    title: plan.title,
    message: plan.message,
    level: plan.level,
    kind: plan.kind,
    by: plan.by,
    by_id: plan.by_id ?? null,
    by_username: plan.by_username ?? null,
    by_role: plan.auto ? "system" : plan.by_role ?? null,
    source: plan.auto ? "auto" : "report",
    target_label: plan.scope === "all" ? (scope === null ? "Semua warga" : "Semua warga di wilayah tugas") : `Radius ${plan.radiusKm} km dari laporan`,
  });
  if (err) return { ok: false, error: err, status: 500 };

  const entry: ReportNoticeLog = {
    sent_at: new Date().toISOString(),
    scope: plan.scope,
    radius_km: plan.scope === "nearby" ? plan.radiusKm : null,
    recipients,
    kind: plan.kind,
    title: plan.title,
    by: plan.by,
    ...(plan.auto ? { auto: true } : {}),
    ...(plan.note ? { note: plan.note } : {}),
  };
  return { ok: true, recipients, log: await appendNoticeLog(report.id, entry) };
}
