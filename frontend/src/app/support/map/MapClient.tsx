"use client";

import { useEffect, useMemo, useState } from "react";
import MapView, { type MapCluster } from "./MapView";
import AiInsight from "@/components/AiInsight";
import { setStatus, useReports } from "@/components/useReports";
import { clusterPoints, timeAgo } from "@/lib/util";
import { DEFAULT_SETTINGS, type Report, type Settings } from "@/lib/types";

const RANGES = [
  [24, "24 jam"],
  [24 * 7, "7 hari"],
  [24 * 30, "30 hari"],
] as const;

export default function MapClient() {
  const [hours, setHours] = useState<number>(24);
  const [showSos, setShowSos] = useState(true);
  const [showReport, setShowReport] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lng: number; at: number } | null>(null);

  // Header bell / user directory navigate here with ?focus=lat,lng
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (!f) return;
    const [lat, lng] = f.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setFocus({ lat, lng, at: Date.now() });
  }, []);

  const { reports, error, reload } = useReports(`hours=${hours}`);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setSettings(s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const full = useMemo(() => {
    const visible = reports.filter((r) => r.status !== "false" && ((r.kind === "sos" && showSos) || (r.kind === "report" && showReport)));
    const windowMs = settings.emergency_window_minutes * 60_000;
    return clusterPoints(visible, settings.cluster_radius_m).map((c) => {
      const sosPeople = new Set(
        c.items.filter((i) => i.kind === "sos" && Date.now() - new Date(i.created_at).getTime() <= windowMs).map((i) => i.nik ?? i.id),
      ).size;
      const confirmed = c.items.some((i) => i.status === "valid");
      return { ...c, sosPeople, confirmed, critical: confirmed || sosPeople >= settings.emergency_threshold };
    });
  }, [reports, showSos, showReport, settings]);

  const mapClusters: MapCluster[] = useMemo(
    () => full.map((c) => ({ anchorId: c.items[0].id, lat: c.lat, lng: c.lng, count: c.items.length, critical: c.critical, confirmed: c.confirmed })),
    [full],
  );

  const selected = anchor ? full.find((c) => c.items.some((i) => i.id === anchor)) ?? null : null;
  const pendingIds = selected ? selected.items.filter((i) => i.status === "pending").map((i) => i.id) : [];

  async function decide(status: "valid" | "false") {
    if (!pendingIds.length) return;
    setBusy(true);
    const err = await setStatus(pendingIds, status);
    setBusy(false);
    if (err) setMsg(err);
    else {
      setMsg(status === "valid" ? `${pendingIds.length} laporan ditandai valid.` : `${pendingIds.length} laporan ditandai palsu.`);
      if (status === "false") setAnchor(null);
      reload();
    }
  }

  const cats = selected ? countBy(selected.items, (i) => i.category) : [];
  const people = selected ? new Set(selected.items.map((i) => i.nik ?? i.id)).size : 0;
  const t = settings.emergency_threshold;

  return (
    <div className={`map-page ${selected ? "with-panel" : ""}`}>
      <div className="map-canvas">
        <MapView clusters={mapClusters} threshold={t} selectedAnchor={anchor} onSelect={setAnchor} focus={focus} />

        <div className="map-filters">
          <div className="pnl">
            <span style={{ fontSize: 12, fontWeight: 600, color: "#5b6478" }}>SUMBER</span>
            <label className="chk"><input type="checkbox" checked={showSos} onChange={(e) => setShowSos(e.target.checked)} />SOS</label>
            <label className="chk"><input type="checkbox" checked={showReport} onChange={(e) => setShowReport(e.target.checked)} />Laporan Warga</label>
          </div>
          <div className="pnl">
            <div className="tabs" role="tablist" aria-label="Rentang waktu">
              {RANGES.map(([h, label]) => (
                <button key={h} role="tab" aria-selected={hours === h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{label}</button>
              ))}
            </div>
            <span className="badge valid"><span className="msym xs">sync</span>Sinkron otomatis</span>
          </div>
          {error && <div className="pnl" style={{ color: "#93000a" }}>{error}</div>}
        </div>

        <div className="map-legend" aria-label="Legenda">
          <strong>Legenda</strong>
          <div className="r"><i style={{ background: "#fca5a5" }} />1 laporan</div>
          <div className="r"><i style={{ background: "#e5383b" }} />Beberapa laporan (makin merah = makin banyak)</div>
          <div className="r"><i style={{ background: "#991b1b" }} />≥ {t} SOS / terkonfirmasi (kritis)</div>
        </div>
      </div>

      {selected && (
        <aside className="map-side" aria-label="Detail titik">
          <div className="hd">
            <div>
              <h2>{selected.items.length} laporan di titik ini</h2>
              <small>{selected.items[0].address ?? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`}</small>
            </div>
            <button className="icon-btn" onClick={() => setAnchor(null)} aria-label="Tutup panel"><span className="msym">close</span></button>
          </div>

          {selected.critical ? (
            <div className="alert error"><span className="msym sm">warning</span><span>
              {selected.confirmed ? "Sudah dikonfirmasi valid oleh petugas." : `${selected.sosPeople} orang menekan SOS dalam ${settings.emergency_window_minutes} menit (ambang ${t}).`}
            </span></div>
          ) : (
            <div className="alert warn"><span className="msym sm">info</span><span>{selected.sosPeople}/{t} SOS dalam {settings.emergency_window_minutes} menit. Belum mencapai ambang otomatis.</span></div>
          )}

          <div className="mini">
            <div><b>{selected.items.length}</b><span>Total laporan</span></div>
            <div><b>{people}</b><span>Pelapor unik</span></div>
          </div>

          <div>
            {cats.map(([name, n]) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{name}</span><b>{n}</b></div>
                <div className="bar"><i style={{ width: `${(n / selected.items.length) * 100}%`, background: "#e5383b" }} /></div>
              </div>
            ))}
          </div>

          <AiInsight
            key={selected.items[0].id}
            ids={selected.items.map((i) => i.id)}
            initial={selected.items.find((i) => i.ai_verdict)?.ai_verdict ?? null}
            label="Apakah berita ini valid?"
          />

          <div className="items">
            {selected.items.slice(0, 8).map((i: Report) => (
              <div className="it" key={i.id}>
                <div>{i.category}<small>{i.description?.slice(0, 80) || "SOS"}</small></div>
                <small>{timeAgo(i.created_at)}</small>
              </div>
            ))}
            {selected.items.length > 8 && <small style={{ color: "#5b6478" }}>+{selected.items.length - 8} lainnya</small>}
          </div>

          <div className="actions">
            <button className="btn ok" disabled={busy || !pendingIds.length} onClick={() => decide("valid")}><span className="msym sm">check</span>Tandai Valid</button>
            <button className="btn danger" disabled={busy || !pendingIds.length} onClick={() => decide("false")}><span className="msym sm">close</span>Tandai Palsu</button>
          </div>
        </aside>
      )}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

function countBy<T>(items: T[], key: (i: T) => string): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
