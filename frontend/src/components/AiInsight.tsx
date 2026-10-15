"use client";

import { useEffect, useState } from "react";
import type { AiVerdict } from "@/lib/types";

const VERDICT_LABEL = { valid: "Kemungkinan Valid", uncertain: "Belum Pasti", invalid: "Kemungkinan Tidak Valid" } as const;

export default function AiInsight({
  ids,
  initial,
  label = "Cek dengan AI",
  running = false,
  state = null,
  onDone,
}: {
  ids: string[];
  initial: AiVerdict | null;
  label?: string;
  running?: boolean;
  state?: "running" | "queued" | "failed" | null;
  onDone?: () => void;
}) {
  const [verdict, setVerdict] = useState<AiVerdict | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = busy || running;

  const initialSig = initial ? `${initial.verdict}|${initial.confidence}|${initial.summary}` : "";
  useEffect(() => {
    if (initial) {
      setVerdict(initial);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSig]);

  async function run() {
    if (working) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(0, 60) }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.running) onDone?.();
      else if (!res.ok) setError(j.error ?? "Analisis AI gagal.");
      else {
        setVerdict(j.verdict);
        onDone?.();
      }
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-box" aria-busy={working}>
      <div className="hd">
        <span><span className="msym sm">auto_awesome</span> AI Insight</span>
        <button className="btn sm" onClick={run} disabled={working || ids.length === 0}>
          {working ? <span className="msym sm spin">progress_activity</span> : <span className="msym sm">refresh</span>}
          {working ? (state === "queued" && !busy ? "AI dalam antrean…" : "AI sedang memeriksa…") : verdict ? "Analisis ulang" : label}
        </button>
      </div>
      {working && !verdict && (
        <div className="ai-running" role="status">
          <span className="skeleton" style={{ width: "45%", height: 22, borderRadius: 9999 }} />
          <span className="skeleton" style={{ width: "100%", height: 14, marginTop: 10 }} />
          <span className="skeleton" style={{ width: "80%", height: 14, marginTop: 6 }} />
          <p>{state === "queued" && !busy
            ? "AI sedang penuh, laporan ini sudah masuk antrean dan akan diperiksa otomatis begitu AI tersedia. Hasilnya muncul di sini tanpa perlu muat ulang."
            : "AI sedang menilai laporan dengan data gempa BMKG dan berita. Hasilnya muncul di sini otomatis."}</p>
        </div>
      )}
      {!working && error && <div className="alert error"><span>{error}</span></div>}
      {!working && !verdict && !error && state === "failed" && (
        <div className="alert warn"><span>AI tidak berhasil memeriksa laporan ini setelah dicoba ulang otomatis selama 2 hari. Tekan <b>Cek dengan AI</b> untuk memasukkannya ke antrean lagi, atau putuskan manual.</span></div>
      )}
      {!working && !verdict && !error && state !== "failed" && <p style={{ fontSize: 14 }}>Tanyakan ke AI apakah kejadian ini tampak valid berdasarkan data laporan.</p>}
      {verdict && (
        <>
          {working && <p className="disc" role="status" style={{ marginTop: 0, marginBottom: 8 }}>{state === "queued" && !busy ? "Pemeriksaan ulang ada di antrean. Hasil di bawah adalah penilaian AI terakhir." : "AI sedang memeriksa ulang. Hasil di bawah adalah penilaian AI terakhir."}</p>}
          <span className={`verdict ${verdict.verdict}`}>{VERDICT_LABEL[verdict.verdict]} · {verdict.confidence}%</span>
          <p style={{ marginTop: 8, fontSize: 14 }}>{verdict.summary}</p>
          {verdict.reasons.length > 0 && <ul>{verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {verdict.recommended_action && <p className="rec">{verdict.recommended_action}</p>}
          <p className="disc">Dihasilkan AI dari data laporan, gempa BMKG, dan judul berita terbaru (tanpa data sensor), bukan keputusan final petugas.</p>
        </>
      )}
    </div>
  );
}
