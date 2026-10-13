"use client";

import { useMemo, useState } from "react";
import { useReports } from "@/components/useReports";
import ReportDetail from "@/components/ReportDetail";
import { KIND_LABEL, STATUS_LABEL, timeAgo } from "@/lib/util";

const STATUS_TABS = [
  ["all", "Semua"],
  ["pending", "Menunggu"],
  ["valid", "Valid"],
  ["false", "Palsu"],
] as const;
const KIND_TABS = [
  ["all", "Semua jenis"],
  ["sos", "SOS"],
  ["report", "Laporan Warga"],
] as const;

export default function ReportsClient() {
  const { reports, loading, error, reload } = useReports("hours=720");
  // Default to "all" so EVERY report is visible on load — reports already
  // reviewed (valid/false) were previously hidden behind the pending tab,
  // which read as "not all reports show up".
  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length, pending: 0, valid: 0, false: 0 };
    reports.forEach((r) => { if (c[r.status] !== undefined) c[r.status]++; });
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
  const filtering = status !== "all" || kind !== "all" || q.trim() !== "";

  return (
    <>
      {/* Summary bar — total reports always visible, so "missing" reports are obvious at a glance. */}
      <div className="report-stats" aria-label="Ringkasan laporan">
        <button className={`stat ${status === "all" ? "on" : ""}`} onClick={() => setStatus("all")}>
          <b>{counts.all}</b><span>Total laporan</span>
        </button>
        <button className={`stat warn ${status === "pending" ? "on" : ""}`} onClick={() => setStatus("pending")}>
          <b>{counts.pending}</b><span><span className="msym xs">pending</span>Menunggu</span>
        </button>
        <button className={`stat ok ${status === "valid" ? "on" : ""}`} onClick={() => setStatus("valid")}>
          <b>{counts.valid}</b><span><span className="msym xs">verified</span>Valid</span>
        </button>
        <button className={`stat bad ${status === "false" ? "on" : ""}`} onClick={() => setStatus("false")}>
          <b>{counts.false}</b><span><span className="msym xs">cancel</span>Palsu</span>
        </button>
      </div>

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
        <button className="icon-btn refresh" onClick={reload} aria-label="Muat ulang laporan" title="Muat ulang">
          <span className={`msym ${loading ? "spin" : ""}`}>refresh</span>
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="report-meta">
        <span>
          Menampilkan <b>{rows.length}</b> dari {reports.length} laporan
          {filtering && <> · <button className="linklike" onClick={() => { setStatus("all"); setKind("all"); setQ(""); }}>Reset filter</button></>}
        </span>
      </div>

      <div className="split">
        <div>
          {loading && reports.length === 0 ? (
            <div className="rcard-skel-list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rcard skel">
                  <span className="skeleton" style={{ height: 14, width: "40%" }} />
                  <span className="skeleton" style={{ height: 20, width: "70%", marginTop: 10 }} />
                  <span className="skeleton" style={{ height: 14, width: "90%", marginTop: 10 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="card empty">
              <span className="msym">{reports.length === 0 ? "inbox" : "filter_alt_off"}</span>
              {reports.length === 0
                ? "Belum ada laporan masuk."
                : "Tidak ada laporan pada filter ini."}
              {filtering && reports.length > 0 && (
                <button className="btn ghost sm" onClick={() => { setStatus("all"); setKind("all"); setQ(""); }}>Tampilkan semua</button>
              )}
            </div>
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
