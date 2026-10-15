"use client";

import { useState } from "react";
import AiInsight from "./AiInsight";
import NotifyPanel from "./NotifyPanel";
import { setStatus } from "./useReports";
import { KIND_LABEL, VIEW_STATUS_LABEL, formatDateTime, maskNik, reportCode, viewStatus } from "@/lib/util";
import CopyId from "./CopyId";
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

  const vs = viewStatus(report);
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=17/${report.lat}/${report.lng}`;

  return (
    <aside className="detail" aria-label="Detail laporan">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span className={`badge ${report.kind}`}>{KIND_LABEL[report.kind]}</span>
          <span className={`badge ${vs}`}>{VIEW_STATUS_LABEL[vs]}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup detail"><span className="msym">close</span></button>
      </div>
      <h2 style={{ fontSize: 20 }}>{report.category}</h2>
      <CopyId code={reportCode(report)} />
      <div className={`detail-cols${report.status === "valid" ? " has-side" : ""}`}>
      <div className="col-main">
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
          {report.address ?? (report.region_pending ? "Menentukan alamat…" : "Alamat tidak ditemukan")}
          {report.region && (
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {[report.region.village, report.region.district, report.region.city, report.region.province]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" · ")}
            </div>
          )}
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Buka di peta ↗</a>
        </dd>
        <dt>Deskripsi</dt><dd>{report.description || <em style={{ color: "#5b6478" }}>Tanpa deskripsi (SOS)</em>}</dd>
      </dl>
      <AiInsight key={report.id} ids={[report.id]} initial={report.ai_verdict} running={!!report.ai_running} state={report.ai_state ?? null} onDone={onChanged} />
      {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
      {vs === "review" && (
        <div className="review-box" role="status">
          <span className="msym sm">task_alt</span>
          <div>
            <b>Valid · Perlu ditinjau</b>
            <p>AI dan data gempa BMKG memvalidasi laporan ini secara otomatis. Periksa apakah penilaian AI sudah benar: konfirmasi Valid kalau benar, atau tandai Palsu kalau AI keliru.</p>
          </div>
        </div>
      )}
      <div className="actions">
        <button className="btn ok" disabled={busy || vs === "valid"} onClick={() => decide("valid")}>
          <span className="msym sm">check</span> {vs === "review" ? "AI benar · Konfirmasi Valid" : "Tandai Valid"}
        </button>
        <button className="btn danger" disabled={busy || vs === "false"} onClick={() => decide("false")}>
          <span className="msym sm">close</span> {vs === "review" ? "AI salah · Tandai Palsu" : "Tandai Palsu"}
        </button>
      </div>
      {report.ai_review && (
        <p className="notify-hint">
          <span className="msym xs">{report.ai_review.ok ? "verified" : "report"}</span>
          Tinjauan petugas: penilaian AI {report.ai_review.ok ? "benar" : "salah"} · oleh {report.ai_review.by}
        </p>
      )}
      {report.status === "pending" && (
        <p className="notify-hint">
          <span className="msym xs">info</span>
          {report.ai_verdict
            ? "Pemeriksaan otomatis belum dikonfirmasi AI dan BMKG sekaligus, jadi menunggu keputusan petugas. Tandai Valid untuk mengirim peringatan ke warga."
            : "Tandai Valid untuk mengirim peringatan ke warga terdekat atau semua warga."}
        </p>
      )}
      </div>
      {report.status === "valid" && (
        <div className="col-side">
          {!report.reviewed_by && (
            <p className="notify-hint"><span className="msym xs">auto_awesome</span>Diverifikasi otomatis oleh AI dan data gempa BMKG, menunggu konfirmasi petugas.</p>
          )}
          <NotifyPanel key={`notify-${report.id}`} report={report} aiRunning={report.ai_state === "running"} />
        </div>
      )}
      </div>
    </aside>
  );
}
