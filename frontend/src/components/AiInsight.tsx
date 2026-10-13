"use client";

import { useState } from "react";
import type { AiVerdict } from "@/lib/types";

const VERDICT_LABEL = { valid: "Kemungkinan Valid", uncertain: "Belum Pasti", invalid: "Kemungkinan Tidak Valid" } as const;

export default function AiInsight({
  ids,
  initial,
  label = "Cek dengan AI",
  onDone,
}: {
  ids: string[];
  initial: AiVerdict | null;
  label?: string;
  onDone?: () => void;
}) {
  const [verdict, setVerdict] = useState<AiVerdict | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(0, 60) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error ?? "Analisis AI gagal.");
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
    <div className="ai-box">
      <div className="hd">
        <span><span className="msym sm">auto_awesome</span> AI Insight</span>
        <button className="btn sm" onClick={run} disabled={busy || ids.length === 0}>
          {busy ? <span className="msym sm spin">progress_activity</span> : <span className="msym sm">refresh</span>}
          {verdict ? "Analisis ulang" : label}
        </button>
      </div>
      {error && <div className="alert error"><span>{error}</span></div>}
      {!verdict && !error && <p style={{ fontSize: 14 }}>Tanyakan ke AI apakah kejadian ini tampak valid berdasarkan data laporan.</p>}
      {verdict && (
        <>
          <span className={`verdict ${verdict.verdict}`}>{VERDICT_LABEL[verdict.verdict]} · {verdict.confidence}%</span>
          <p style={{ marginTop: 8, fontSize: 14 }}>{verdict.summary}</p>
          {verdict.reasons.length > 0 && <ul>{verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {verdict.recommended_action && <p className="rec">{verdict.recommended_action}</p>}
          <p className="disc">Dihasilkan AI dari data laporan saja (tanpa akses berita/sensor), bukan keputusan final petugas.</p>
        </>
      )}
    </div>
  );
}
