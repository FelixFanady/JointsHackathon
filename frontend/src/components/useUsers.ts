"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DirectoryUser = {
  nik: string;
  nik_masked: string;
  full_name: string;
  active: boolean;
  area: string | null;
  phone: string | null;
  photo: string | null;
  last_login: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  notices_fetched_at: string | null;
  region: UserRegion | null;
  region_pending: boolean;
};

export type UserRegion = {
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  label: string;
  source: "gps" | "address";
};

export function useUsers(intervalMs = 20000, opts: { photos?: boolean } = {}) {
  const photos = opts.photos !== false;
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(photos ? "/api/users" : "/api/users?photos=0", { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const j = await res.json();
      if (!alive.current) return;
      if (!res.ok) setError(j.error ?? "Gagal memuat data pengguna.");
      else { setUsers(j.users ?? []); setError(""); }
    } catch {
      if (alive.current) setError("Tidak dapat terhubung ke server.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [photos]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, intervalMs]);

  return { users, loading, error, reload: load };
}
