"use client";

import { useState } from "react";
import AiInsight from "./AiInsight";
import { setStatus } from "./useReports";
import { KIND_LABEL, STATUS_LABEL, formatDateTime, maskNik } from "@/lib/util";
import type { Report } from "@/lib/types";

export default function ReportDetail({ report, onChanged, onClose }: { report: Report; onChanged: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(status: "valid" | "false") {
    setBusy(true);
    setError("");
    const err = await setStatus([report.id], status);
    setBusy(false);
    if (err) setError(err);
    else onChanged();
  }

  const mapsUrl = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=17/${report.lat}/${report.lng}`;

  return (
    <aside className="detail" aria-label="Detail laporan">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span className={`badge ${report.kind}`}>{KIND_LABEL[report.kind]}</span>
          <span className={`badge ${report.status}`}>{STATUS_LABEL[report.status]}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup detail"><span className="msym">close</span></button>
      </div>
      <h2 style={{ fontSize: 20 }}>{report.category}</h2>
      {report.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo" src={report.photo_url} alt={`Foto laporan ${report.category}`} style={{ marginTop: 12 }} referrerPolicy="no-referrer" />
      )}
      <dl>
        <dt>Pelapor</dt><dd>{report.reporter_name}</dd>
        <dt>NIK</dt><dd className="mono">{maskNik(report.nik)}</dd>
        <dt>Waktu</dt><dd>{formatDateTime(report.created_at)}</dd>
        <dt>Lokasi</dt>
        <dd>
          {report.address ?? "-"}<br />
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">{report.lat.toFixed(5)}, {report.lng.toFixed(5)} ↗</a>
        </dd>
        <dt>Deskripsi</dt><dd>{report.description || <em style={{ color: "#5b6478" }}>Tanpa deskripsi (SOS)</em>}</dd>
      </dl>
      <AiInsight key={report.id} ids={[report.id]} initial={report.ai_verdict} onDone={onChanged} />
      {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="actions">
        <button className="btn ok" disabled={busy || report.status === "valid"} onClick={() => decide("valid")}>
          <span className="msym sm">check</span> Tandai Valid
        </button>
        <button className="btn danger" disabled={busy || report.status === "false"} onClick={() => decide("false")}>
          <span className="msym sm">close</span> Tandai Palsu
        </button>
      </div>
    </aside>
  );
}
