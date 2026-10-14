"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReports } from "@/components/useReports";
import ReportDetail from "@/components/ReportDetail";
import { KIND_LABEL, VIEW_STATUS_LABEL, timeAgo, viewStatus } from "@/lib/util";
import type { Report } from "@/lib/types";
import Pager, { usePaged } from "@/components/Pager";

/** Distinct values with counts, biggest first. */
function tally(values: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  values.forEach((v) => v && m.set(v, (m.get(v) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const STATUS_TABS = [
  ["all", "Semua"],
  ["pending", "Menunggu"],
  ["review", "Perlu ditinjau"],
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
  const [city, setCity] = useState(""); // "" = semua, "__none" = belum diketahui
  const [district, setDistrict] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Turn coordinates into a street address + area for reports that don't have one yet.
  // The street map allows ~1 request/s, so the server does a few per call; loop until done.
  const pendingRegions = reports.filter((r) => r.region_pending).length;
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || loading || pendingRegions === 0) return;
    synced.current = true;
    let stop = false;
    (async () => {
      setSyncing(true);
      for (let i = 0; i < 40 && !stop; i++) {
        const r = await fetch("/api/reports/sync-regions", { method: "POST" }).catch(() => null);
        const j = r && r.ok ? await r.json().catch(() => null) : null;
        if (!j) break;
        if (j.resolved > 0) reload();
        if (j.remaining <= 0 || j.resolved === 0) break;
      }
      if (!stop) { setSyncing(false); reload(); }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pendingRegions]);

  const cities = useMemo(() => tally(reports.map((r) => r.region?.city)), [reports]);
  const districts = useMemo(() => tally(reports.filter((r) => r.region?.city === city).map((r) => r.region?.district)), [reports, city]);
  const unknownRegion = reports.filter((r) => !r.region).length;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length, pending: 0, review: 0, valid: 0, false: 0 };
    reports.forEach((r) => { c[viewStatus(r)]++; });
    return c;
  }, [reports]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter(
      (r) =>
        (status === "all" || viewStatus(r) === status) &&
        (kind === "all" || r.kind === kind) &&
        (!city || (city === "__none" ? !r.region : r.region?.city === city)) &&
        (!district || r.region?.district === district) &&
        (!needle || `${r.category} ${r.reporter_name} ${r.description ?? ""} ${r.address ?? ""} ${r.region?.label ?? ""} ${r.region?.village ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [reports, status, kind, q, city, district]);

  // Paging over the filtered list; the current page is then grouped by area.
  const paged = usePaged(rows, [status, kind, q, city, district, grouped]);
  const pageRows = paged.slice;

  // Group by area: kecamatan + kota (biggest first); reports without a known area last.
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; sub: string | null; items: Report[] }>();
    for (const r of pageRows) {
      const key = r.region ? r.region.label : "__none";
      const label = r.region ? (r.region.district ?? r.region.city ?? r.region.label) : r.region_pending ? "Menentukan daerah…" : "Daerah belum diketahui";
      const sub = r.region ? [r.region.city, r.region.province].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") : null;
      if (!m.has(key)) m.set(key, { label, sub, items: [] });
      m.get(key)!.items.push(r);
    }
    return [...m.entries()]
      .sort(([ka, a], [kb, b]) => (ka === "__none" ? 1 : kb === "__none" ? -1 : b.items.length - a.items.length || a.label.localeCompare(b.label)))
      .map(([key, g]) => ({ key, ...g, pending: g.items.filter((i) => i.status === "pending").length }));
  }, [pageRows]);

  const selected = reports.find((r) => r.id === selId) ?? null;
  const filtering = status !== "all" || kind !== "all" || q.trim() !== "" || city !== "" || district !== "";
  const resetAll = () => { setStatus("all"); setKind("all"); setQ(""); setCity(""); setDistrict(""); };

  const card = (r: Report) => (
    <button key={r.id} className={`rcard ${r.id === selId ? "sel" : ""}`} onClick={() => setSelId(r.id)}>
      <div className="row">
        <div className="l">
          <span className={`badge ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
          <span className={`badge ${viewStatus(r)}`}>{VIEW_STATUS_LABEL[viewStatus(r)]}</span>
          {r.ai_verdict && <span className="badge ai"><span className="msym xs">auto_awesome</span>AI: {r.ai_verdict.verdict}</span>}
        </div>
        <span className="t">{timeAgo(r.created_at)}</span>
      </div>
      <h3>{r.category}</h3>
      <p>{r.description || "SOS — tanpa deskripsi"}</p>
      <div className="foot">
        <span><span className="msym xs">person</span>{r.reporter_name}</span>
        <span className="addr" title={r.address ?? undefined}>
          <span className="msym xs">location_on</span>
          {r.address ?? (r.region_pending ? "Menentukan alamat…" : r.region?.label ?? "Alamat tidak ditemukan")}
        </span>
        {r.photo_url && <span><span className="msym xs">image</span>Foto</span>}
      </div>
    </button>
  );

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
        <button className={`stat review ${status === "review" ? "on" : ""}`} onClick={() => setStatus("review")} title="Divalidasi otomatis oleh AI + BMKG, menunggu konfirmasi petugas">
          <b>{counts.review}</b><span><span className="msym xs">auto_awesome</span>Perlu ditinjau</span>
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
        <input className="input search grow" placeholder="Cari kategori, pelapor, alamat, daerah…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari laporan" />
        <select className="input select-sm" value={city} onChange={(e) => { setCity(e.target.value); setDistrict(""); }} aria-label="Filter kota atau kabupaten">
          <option value="">Semua daerah</option>
          {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          {unknownRegion > 0 && <option value="__none">Daerah belum diketahui ({unknownRegion})</option>}
        </select>
        {city && city !== "__none" && (
          <select className="input select-sm" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Filter kecamatan">
            <option value="">Semua kecamatan</option>
            {districts.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
          </select>
        )}
        <button className={`btn ghost sm ${grouped ? "on" : ""}`} onClick={() => setGrouped((g) => !g)} aria-pressed={grouped} title="Kelompokkan laporan per kecamatan">
          <span className="msym sm">{grouped ? "stack" : "inbox"}</span>{grouped ? "Per daerah" : "Daftar"}
        </button>
        <button className="icon-btn refresh" onClick={reload} aria-label="Muat ulang laporan" title="Muat ulang">
          <span className={`msym ${loading ? "spin" : ""}`}>refresh</span>
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {syncing && (
        <div className="bulk-bar" role="status"><span className="msym spin">sync</span>Mengubah koordinat menjadi alamat dari peta (OpenStreetMap)… {pendingRegions > 0 && <b>{pendingRegions} tersisa</b>}</div>
      )}

      <div className="report-meta">
        <span>
          Menampilkan <b>{rows.length}</b> dari {reports.length} laporan
          {grouped && rows.length > 0 && <> · halaman ini di <b>{groups.length}</b> daerah</>}
          {filtering && <> · <button className="linklike" onClick={resetAll}>Reset filter</button></>}
        </span>
      </div>

      <div className="report-list">
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
                <button className="btn ghost sm" onClick={resetAll}>Tampilkan semua</button>
              )}
            </div>
          ) : grouped ? (
            groups.map((g) => (
              <section key={g.key} className="region-group" aria-label={`Laporan di ${g.label}`}>
                <header>
                  <span className="msym sm">home_pin</span>
                  <div className="t">
                    <strong>{g.label}</strong>
                    {g.sub && <small>{g.sub}</small>}
                  </div>
                  <span className="n">{g.items.length} laporan{g.pending > 0 && <> · <b>{g.pending} menunggu</b></>}</span>
                </header>
                {g.items.map(card)}
              </section>
            ))
          ) : (
            pageRows.map(card)
          )}
        </div>
        <Pager {...paged} label="laporan" />
      </div>
      {selected && <ReportModal report={selected} onChanged={reload} onClose={() => setSelId(null)} />}
    </>
  );
}

/** Report detail as a centered pop-up over the list (closes on ✕, Esc, or a click outside). */
function ReportModal({ report, onChanged, onClose }: { report: Report; onChanged: () => void; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 160);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div className={`overlay${leaving ? " leaving" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal lg report-modal${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label={`Detail laporan ${report.category}`}>
        <ReportDetail report={report} onChanged={onChanged} onClose={close} />
      </div>
    </div>
  );
}
