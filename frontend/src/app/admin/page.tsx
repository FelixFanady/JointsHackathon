import { db } from "@/lib/supabase";
import RecentReports from "./RecentReports";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) {
  let q = db().from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

export default async function AdminHome() {
  const [total, pending, valid, falseN, citizens, support, { data: recent }] = await Promise.all([
    count("reports"),
    count("reports", (q) => q.eq("status", "pending")),
    count("reports", (q) => q.eq("status", "valid")),
    count("reports", (q) => q.eq("status", "false")),
    count("citizens", (q) => q.eq("active", true)),
    count("profiles", (q) => q.eq("role", "support").eq("active", true)),
    db()
      .from("reports")
      .select("id,kind,category,reporter_name,status,reviewed_by,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Ringkasan</h1>
          <p>Gambaran singkat laporan masuk, pengguna terdaftar, dan petugas support aktif.</p>
        </div>
      </div>

      <div className="grid-stats">
        <div className="stat"><div className="k"><span className="msym sm">inbox</span>Total laporan</div><div className="v">{total}</div></div>
        <div className="stat warn"><div className="k"><span className="msym sm">hourglass_top</span>Menunggu verifikasi</div><div className="v">{pending}</div></div>
        <div className="stat ok"><div className="k"><span className="msym sm">verified</span>Valid</div><div className="v">{valid}</div></div>
        <div className="stat danger"><div className="k"><span className="msym sm">block</span>Palsu</div><div className="v">{falseN}</div></div>
        <div className="stat"><div className="k"><span className="msym sm">badge</span>NIK aktif</div><div className="v">{citizens}</div></div>
        <div className="stat"><div className="k"><span className="msym sm">support_agent</span>Support aktif</div><div className="v">{support}</div></div>
      </div>

      <div className="card">
        <h2>Laporan terbaru</h2>
        <div className="table-wrap">
          {recent?.length ? (
            <RecentReports rows={recent as Parameters<typeof RecentReports>[0]["rows"]} />
          ) : (
            <div className="empty"><span className="msym">inbox</span>Belum ada laporan.</div>
          )}
        </div>
      </div>
    </div>
  );
}
