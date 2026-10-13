"use client";

import { useMemo, useState } from "react";
import { useReports } from "@/components/useReports";
import ReportDetail from "@/components/ReportDetail";
import { KIND_LABEL, STATUS_LABEL, timeAgo } from "@/lib/util";

const STATUS_TABS = [
  ["pending", "Menunggu"],
  ["valid", "Valid"],
  ["false", "Palsu"],
  ["all", "Semua"],
] as const;
const KIND_TABS = [
  ["all", "Semua jenis"],
  ["sos", "SOS"],
  ["report", "Laporan Warga"],
] as const;

export default function ReportsClient() {
  const { reports, loading, error, reload } = useReports("hours=720");
  const [status, setStatus] = useState<string>("pending");
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length, pending: 0, valid: 0, false: 0 };
    reports.forEach((r) => c[r.status]++);
    return c;
  }, [reports]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (kind === "all" || r.kind === kind) &&
        (!needle || `${r.category} ${r.reporter_name} ${r.description ?? ""} ${r.address ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [reports, status, kind, q]);

  const selected = reports.find((r) => r.id === selId) ?? null;

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Status">
          {STATUS_TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>
              {label} <span style={{ opacity: 0.6 }}>{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Jenis">
          {KIND_TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
        <input className="input search grow" placeholder="Cari kategori, pelapor, lokasi…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari laporan" />
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="split">
        <div>
          {loading ? (
            <div className="empty">Memuat laporan…</div>
          ) : rows.length === 0 ? (
            <div className="card empty"><span className="msym">inbox</span>Tidak ada laporan pada filter ini.</div>
          ) : (
            rows.map((r) => (
              <button key={r.id} className={`rcard ${r.id === selId ? "sel" : ""}`} onClick={() => setSelId(r.id)}>
                <div className="row">
                  <div className="l">
                    <span className={`badge ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                    <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    {r.ai_verdict && <span className="badge ai"><span className="msym xs">auto_awesome</span>AI: {r.ai_verdict.verdict}</span>}
                  </div>
                  <span className="t">{timeAgo(r.created_at)}</span>
                </div>
                <h3>{r.category}</h3>
                <p>{r.description || "SOS — tanpa deskripsi"}</p>
                <div className="foot">
                  <span><span className="msym xs">person</span>{r.reporter_name}</span>
                  <span><span className="msym xs">location_on</span>{r.address ?? `${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}`}</span>
                  {r.photo_url && <span><span className="msym xs">image</span>Foto</span>}
                </div>
              </button>
            ))
          )}
        </div>
        {selected ? (
          <ReportDetail report={selected} onChanged={reload} onClose={() => setSelId(null)} />
        ) : (
          <div className="detail empty" style={{ position: "static" }}><span className="msym">touch_app</span>Pilih laporan untuk melihat detail.</div>
        )}
      </div>
    </>
  );
}
