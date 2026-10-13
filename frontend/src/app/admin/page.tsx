import { db } from "@/lib/supabase";
import { KIND_LABEL, STATUS_LABEL, timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) {
  let q = db().from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

export default async function AdminHome() {
  const [total, pending, valid, falseN, citizens, support] = await Promise.all([
    count("reports"),
    count("reports", (q) => q.eq("status", "pending")),
    count("reports", (q) => q.eq("status", "valid")),
    count("reports", (q) => q.eq("status", "false")),
    count("citizens", (q) => q.eq("active", true)),
    count("profiles", (q) => q.eq("role", "support").eq("active", true)),
  ]);
  const { data: recent } = await db()
    .from("reports")
    .select("id,kind,category,reporter_name,status,created_at")
    .order("created_at", { ascending: false })
    .limit(8);

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
            <table className="table">
              <thead><tr><th>Jenis</th><th>Kategori</th><th>Pelapor</th><th>Status</th><th>Waktu</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`badge ${r.kind}`}>{KIND_LABEL[r.kind as "sos" | "report"]}</span></td>
                    <td>{r.category}</td>
                    <td>{r.reporter_name}</td>
                    <td><span className={`badge ${r.status}`}>{STATUS_LABEL[r.status as "pending" | "valid" | "false"]}</span></td>
                    <td>{timeAgo(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><span className="msym">inbox</span>Belum ada laporan.</div>
          )}
        </div>
      </div>
    </div>
  );
}
