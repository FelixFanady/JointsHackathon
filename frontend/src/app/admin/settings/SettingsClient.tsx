"use client";

import { useState } from "react";
import type { Settings } from "@/lib/types";

export default function SettingsClient({ initial }: { initial: Settings }) {
  const [s, setS] = useState({
    emergency_threshold: String(initial.emergency_threshold),
    emergency_window_minutes: String(initial.emergency_window_minutes),
    cluster_radius_m: String(initial.cluster_radius_m),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emergency_threshold: Number(s.emergency_threshold),
        emergency_window_minutes: Number(s.emergency_window_minutes),
        cluster_radius_m: Number(s.cluster_radius_m),
      }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Pengaturan tersimpan." } : { ok: false, text: j.error ?? "Gagal menyimpan." });
  }

  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });

  return (
    <form className="card" style={{ maxWidth: 560 }} onSubmit={save}>
      <h2>Validasi tombol darurat</h2>
      <p className="sub">Jika jumlah orang yang menekan SOS di satu area mencapai ambang dalam jendela waktu, titik di peta otomatis berstatus kritis.</p>
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div>}
      <div className="field">
        <label htmlFor="th">Ambang jumlah orang</label>
        <input id="th" className="input" type="number" min={2} max={10000} value={s.emergency_threshold} onChange={set("emergency_threshold")} required />
        <span className="hint">Default 15 orang.</span>
      </div>
      <div className="field">
        <label htmlFor="wn">Jendela waktu (menit)</label>
        <input id="wn" className="input" type="number" min={1} max={1440} value={s.emergency_window_minutes} onChange={set("emergency_window_minutes")} required />
      </div>
      <div className="field">
        <label htmlFor="rd">Radius pengelompokan titik (meter)</label>
        <input id="rd" className="input" type="number" min={50} max={5000} value={s.cluster_radius_m} onChange={set("cluster_radius_m")} required />
        <span className="hint">Laporan dalam jarak ini digabung menjadi satu titik merah di peta.</span>
      </div>
      <button className="btn primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan pengaturan"}</button>
    </form>
  );
}
