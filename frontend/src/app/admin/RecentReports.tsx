"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ReportModal from "@/components/ReportModal";
import { KIND_LABEL, VIEW_STATUS_LABEL, reportCode, timeAgo, viewStatus } from "@/lib/util";
import type { Report } from "@/lib/types";

type Row = Pick<Report, "id" | "kind" | "category" | "reporter_name" | "status" | "reviewed_by" | "created_at">;

export default function RecentReports({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async (id: string): Promise<Report | null> => {
    const res = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (!res) throw new Error("Tidak dapat terhubung ke server.");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Gagal memuat laporan.");
    return (j.reports as Report[] | undefined)?.[0] ?? null;
  }, []);

  async function open(id: string) {
    if (loadingId) return;
    setLoadingId(id);
    setError("");
    try {
      const r = await fetchReport(id);
      if (r) setReport(r);
      else setError("Laporan tidak ditemukan atau di luar wilayah Anda.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan.");
    } finally {
      setLoadingId(null);
    }
  }

  const changed = useCallback(async () => {
    router.refresh();
    if (!report) return;
    const r = await fetchReport(report.id).catch(() => null);
    if (r) setReport(r);
  }, [router, report, fetchReport]);

  return (
    <>
      {error && <div className="alert error" role="alert" style={{ margin: "8px 0 12px" }}>{error}</div>}
      <table className="table">
        <thead><tr><th>ID Laporan</th><th>Jenis</th><th>Kategori</th><th>Pelapor</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const vs = viewStatus(r);
            return (
              <tr
                key={r.id}
                className={`row-link${loadingId === r.id ? " loading" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`Lihat detail laporan ${reportCode(r)}`}
                aria-busy={loadingId === r.id}
                onClick={() => open(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(r.id);
                  }
                }}
              >
                <td className="mono">{reportCode(r)}</td>
                <td><span className={`badge ${r.kind}`}>{KIND_LABEL[r.kind]}</span></td>
                <td>{r.category}</td>
                <td>{r.reporter_name}</td>
                <td><span className={`badge ${vs}`}>{VIEW_STATUS_LABEL[vs]}</span></td>
                <td>{timeAgo(r.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {report && <ReportModal report={report} onChanged={changed} onClose={() => setReport(null)} />}
    </>
  );
}
