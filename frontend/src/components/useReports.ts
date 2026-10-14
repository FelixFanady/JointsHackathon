"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Report } from "@/lib/types";

/** Polls /api/reports. `query` must be a stable string like "hours=24".
 *  While any report has an AI check running, it polls every 3 s so the result appears without a refresh. */
export function useReports(query: string, intervalMs = 15000) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const aiRunning = reports.some((r) => r.ai_running);
  const every = aiRunning ? Math.min(3000, intervalMs) : intervalMs;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports?${query}`, { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const j = await res.json();
      if (!alive.current) return;
      if (!res.ok) setError(j.error ?? "Gagal memuat laporan.");
      else { setReports(j.reports); setError(""); }
    } catch {
      if (alive.current) setError("Tidak dapat terhubung ke server.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // Separate from the first load so switching between fast/normal polling does not refetch immediately.
  useEffect(() => {
    const t = setInterval(load, every);
    return () => clearInterval(t);
  }, [load, every]);

  return { reports, loading, error, reload: load };
}

export async function setStatus(ids: string[], status: "valid" | "false"): Promise<string | null> {
  const res = await fetch("/api/reports", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, status }),
  });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.error ?? "Gagal menyimpan keputusan.";
}
