import PerformanceTable from "./PerformanceTable";
import Link from "next/link";
import { db, fetchAll } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performa Support — SiagaKu Admin" };

const RANGES = [7, 30, 90];

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [{ data: staff }, { data: reviewed }, { count: pending }] = await Promise.all([
    db().from("profiles").select("id,full_name,username,unit,active").eq("role", "support"),
    fetchAll<{ reviewed_by: string; status: string; created_at: string; reviewed_at: string; id: string }>(
      (a, b) => db().from("reports").select("id,reviewed_by,status,created_at,reviewed_at").not("reviewed_by", "is", null).gte("reviewed_at", since).order("reviewed_at").order("id").range(a, b),
      20000,
    ),
    db().from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const stats = new Map<string, { handled: number; valid: number; fake: number; respMs: number }>();
  for (const r of reviewed ?? []) {
    const s = stats.get(r.reviewed_by) ?? { handled: 0, valid: 0, fake: 0, respMs: 0 };
    s.handled++;
    if (r.status === "valid") s.valid++; else s.fake++;
    s.respMs += new Date(r.reviewed_at).getTime() - new Date(r.created_at).getTime();
    stats.set(r.reviewed_by, s);
  }

  const rows = (staff ?? [])
    .map((p) => {
      const s = stats.get(p.id) ?? { handled: 0, valid: 0, fake: 0, respMs: 0 };
      return { ...p, ...s, avgMin: s.handled ? s.respMs / s.handled / 60000 : null };
    })
    .sort((a, b) => b.handled - a.handled);

  const total = rows.reduce((n, r) => n + r.handled, 0);
  const valid = rows.reduce((n, r) => n + r.valid, 0);
  const respTotal = rows.reduce((n, r) => n + r.respMs, 0);
  const avg = total ? respTotal / total / 60000 : null;
  const max = Math.max(1, ...rows.map((r) => r.handled));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Performa Support</h1>
          <p>Volume penanganan, rasio valid/palsu, dan rata-rata waktu dari laporan masuk sampai diputuskan petugas.</p>
        </div>
        <nav className="tabs" aria-label="Rentang waktu">
          {RANGES.map((d) => (
            <Link key={d} href={`/admin/performance?days=${d}`} className={days === d ? "on" : ""} aria-current={days === d ? "page" : undefined}>{d} hari</Link>
          ))}
        </nav>
      </div>

      <div className="grid-stats">
        <div className="stat"><div className="k"><span className="msym sm">task_alt</span>Laporan ditangani</div><div className="v">{total}</div><div className="d">{days} hari terakhir</div></div>
        <div className="stat"><div className="k"><span className="msym sm">speed</span>Rata-rata waktu respons</div><div className="v">{avg === null ? "-" : fmtMin(avg)}</div><div className="d">sejak laporan masuk</div></div>
        <div className="stat ok"><div className="k"><span className="msym sm">verified</span>Proporsi valid</div><div className="v">{total ? Math.round((valid / total) * 100) : 0}%</div><div className="d">{valid} valid · {total - valid} palsu</div></div>
        <div className="stat warn"><div className="k"><span className="msym sm">hourglass_top</span>Antrean menunggu</div><div className="v">{pending ?? 0}</div><div className="d">belum diputuskan</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "20px 20px 0" }}><h2>Peringkat personel</h2><p className="sub">Diurutkan berdasarkan jumlah laporan ditangani.</p></div>
        <div className="table-wrap">
          {rows.length === 0 ? (
            <div className="empty"><span className="msym">support_agent</span>Belum ada akun support.</div>
          ) : (
            <PerformanceTable
              max={max}
              rows={rows.map((r) => ({
                id: r.id, full_name: r.full_name, unit: r.unit ?? null, username: r.username,
                handled: r.handled, valid: r.valid, fake: r.fake, active: r.active,
                avgLabel: r.avgMin === null ? "-" : fmtMin(r.avgMin),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function fmtMin(m: number) {
  if (m < 1) return "<1 mnt";
  if (m < 60) return `${m.toFixed(1)} mnt`;
  if (m < 60 * 24) return `${(m / 60).toFixed(1)} jam`;
  return `${(m / 1440).toFixed(1)} hari`;
}
