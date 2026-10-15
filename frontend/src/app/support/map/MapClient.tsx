"use client";

import { useEffect, useMemo, useState } from "react";
import MapView, { type MapCluster } from "./MapView";
import AiInsight from "@/components/AiInsight";
import { setStatus, useReports } from "@/components/useReports";
import { clusterPoints, reportCode, timeAgo } from "@/lib/util";
import { DEFAULT_SETTINGS, type Report, type ReportStatus, type Settings } from "@/lib/types";
import ReportModal from "@/components/ReportModal";
import { homeForAreas, type MapHome } from "@/lib/provinces";
import { categoryShares, colorFor } from "@/lib/categoryColors";

const RANGES = [
  [24, "24 jam"],
  [24 * 7, "7 hari"],
  [24 * 30, "30 hari"],
] as const;

const STATUS_ORDER: Record<ReportStatus, number> = { pending: 0, valid: 1, false: 2 };
const STATUS_LABEL: Record<ReportStatus, string> = { pending: "Menunggu", valid: "Valid", false: "False" };

export default function MapClient() {
  const [hours, setHours] = useState<number>(24);
  const [showSos, setShowSos] = useState(true);
  const [showReport, setShowReport] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (!f) return;
    const [lat, lng] = f.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setFocus({ lat, lng, at: Date.now() });
  }, []);

  const { reports, error, reload } = useReports(`hours=${hours}`);

  const [home, setHome] = useState<MapHome | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/me/areas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHome(j && Array.isArray(j.areas) ? homeForAreas(j.areas) : null))
      .catch(() => setHome(null));
  }, []);

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
    const visible = reports.filter((r) => (r.kind === "sos" && showSos) || (r.kind === "report" && showReport));
    const windowMs = settings.emergency_window_minutes * 60_000;
    return clusterPoints(visible, settings.cluster_radius_m)
      .map((c) => {
        const active = c.items.filter((i) => i.status !== "false");
        const sosPeople = new Set(
          active.filter((i) => i.kind === "sos" && Date.now() - new Date(i.created_at).getTime() <= windowMs).map((i) => i.nik ?? i.id),
        ).size;
        const confirmed = active.some((i) => i.status === "valid");
        return { ...c, active, sosPeople, confirmed, critical: confirmed || sosPeople >= settings.emergency_threshold };
      })
      .filter((c) => c.active.length > 0);
  }, [reports, showSos, showReport, settings]);

  const mapClusters: MapCluster[] = useMemo(
    () =>
      full.map((c) => ({
        anchorId: c.active[0].id, lat: c.lat, lng: c.lng, count: c.active.length, critical: c.critical, confirmed: c.confirmed,
        segments: categoryShares(c.active.map((i) => i.category)).map((s) => ({ color: s.color, share: s.share })),
      })),
    [full],
  );

  const legendCats = useMemo(() => categoryShares(full.flatMap((c) => c.active.map((i) => i.category))), [full]);

  const selected = anchor ? full.find((c) => c.items.some((i) => i.id === anchor)) ?? null : null;
  const items = useMemo(
    () =>
      selected
        ? [...selected.items].sort(
            (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
        : [],
    [selected],
  );
  const pendingIds = items.filter((i) => i.status === "pending").map((i) => i.id);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? reports.find((r) => r.id === detailId) ?? null : null;

  useEffect(() => setChecked(new Set()), [anchor]);

  const pendingKey = pendingIds.join(",");
  useEffect(() => {
    const allowed = new Set(pendingKey ? pendingKey.split(",") : []);
    setChecked((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pendingKey]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allChecked = pendingIds.length > 0 && pendingIds.every((id) => checked.has(id));
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(pendingIds));
  }

  async function decide(status: "valid" | "false") {
    const ids = pendingIds.filter((id) => checked.has(id));
    if (!ids.length || busy) return;
    setBusy(true);
    const err = await setStatus(ids, status);
    if (err) setMsg(err);
    else {
      setMsg(status === "valid" ? `${ids.length} laporan ditandai Valid.` : `${ids.length} laporan ditandai False.`);
      setChecked(new Set());
      await reload();
    }
    setBusy(false);
  }

  const cats = selected ? countBy(selected.active, (i) => i.category) : [];
  const people = selected ? new Set(selected.active.map((i) => i.nik ?? i.id)).size : 0;
  const nChecked = checked.size;
  const t = settings.emergency_threshold;

  return (
    <div className={`map-page ${selected ? "with-panel" : ""}`}>
      <div className="map-canvas">
        <MapView clusters={mapClusters} threshold={t} selectedAnchor={anchor} onSelect={setAnchor} focus={focus} home={home} />
        {home && <div className="map-area-chip" role="status"><span className="msym xs">home_pin</span>Wilayah: {home.label}</div>}

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
          {legendCats.length === 0 ? (
            <div className="r muted">Belum ada laporan pada filter ini.</div>
          ) : (
            legendCats.map((c) => (
              <div key={c.category} className="r"><i style={{ background: c.color }} />{c.category}<b className="n">{c.count}</b></div>
            ))
          )}
          <div className="sep" />
          <div className="r"><i className="pie" />Campuran: titik dengan beberapa kategori</div>
          <div className="r"><i className="big" />Makin besar = makin banyak laporan</div>
          <div className="r"><i className="crit" />Berdenyut = kritis (≥ {t} SOS / terkonfirmasi)</div>
          <div className="r"><i className="done" />Tepi hijau = sudah divalidasi</div>
        </div>
      </div>

      {selected && (
        <aside className="map-side" aria-label="Detail titik">
          <div className="hd">
            <div>
              <h2>{selected.active.length} laporan di titik ini</h2>
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
            <div><b>{selected.active.length}</b><span>Total laporan</span></div>
            <div><b>{people}</b><span>Pelapor unik</span></div>
          </div>

          <div>
            {cats.map(([name, n]) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{name}</span><b>{n}</b></div>
                <div className="bar"><i style={{ width: `${(n / selected.active.length) * 100}%`, background: colorFor(name) }} /></div>
              </div>
            ))}
          </div>

          <AiInsight
            key={selected.active[0].id}
            ids={selected.active.map((i) => i.id)}
            initial={selected.active.find((i) => i.ai_verdict)?.ai_verdict ?? null}
            label="Apakah berita ini valid?"
            running={selected.active.some((i) => i.ai_running)}
            state={selected.active.some((i) => i.ai_state === "running") ? "running" : selected.active.some((i) => i.ai_state === "queued") ? "queued" : null}
            onDone={reload}
          />

          <div className="items">
            <div className="items-hd">
              <label className="chk">
                <input type="checkbox" checked={allChecked} disabled={busy || !pendingIds.length} onChange={toggleAll} />
                Pilih semua yang menunggu ({pendingIds.length})
              </label>
            </div>
            {items.map((i: Report) => (
              <div className={`it st-${i.status}`} key={i.id}>
                {i.status === "pending" ? (
                  <input
                    type="checkbox"
                    className="pick"
                    checked={checked.has(i.id)}
                    disabled={busy}
                    onChange={() => toggle(i.id)}
                    aria-label={`Pilih laporan ${reportCode(i)}`}
                  />
                ) : (
                  <span className={`pick-done msym xs`} aria-hidden="true">{i.status === "valid" ? "check_circle" : "cancel"}</span>
                )}
                <button type="button" className="it-open" onClick={() => setDetailId(i.id)} aria-label={`Lihat detail laporan ${reportCode(i)}`}>
                  <span className="it-main">
                    {i.category} <span className="rid mono">{reportCode(i)}</span>
                    <small>{i.description?.slice(0, 80) || "SOS"}</small>
                  </span>
                  <span className="it-side">
                    <span className={`badge ${i.status}`}>{STATUS_LABEL[i.status]}</span>
                    <small>{timeAgo(i.created_at)}</small>
                  </span>
                </button>
              </div>
            ))}
          </div>

          <div className="actions">
            <small className="sel-count">{nChecked ? `${nChecked} laporan dipilih` : pendingIds.length ? "Centang laporan yang ingin ditandai." : "Semua laporan di titik ini sudah ditandai."}</small>
            <div className="row">
              <button className="btn ok" disabled={busy || !nChecked} onClick={() => decide("valid")}><span className="msym sm">check</span>Tandai Valid</button>
              <button className="btn danger" disabled={busy || !nChecked} onClick={() => decide("false")}><span className="msym sm">close</span>Tandai Palsu</button>
            </div>
          </div>
        </aside>
      )}
      {detail && <ReportModal report={detail} onChanged={reload} onClose={() => setDetailId(null)} />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}

function countBy<T>(items: T[], key: (i: T) => string): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
