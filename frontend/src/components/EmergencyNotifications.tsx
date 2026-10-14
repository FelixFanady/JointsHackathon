"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "@/lib/types";
import type { DirectoryUser } from "@/components/useUsers";
import { timeAgo } from "@/lib/util";

export type SosNotif = {
  id: string;
  nik: string | null;
  name: string;
  category: string;
  created_at: string;
  area: string | null;
  last_login: string | null;
  lat: number;
  lng: number;
};

/**
 * Emergency notification bell for the support console. When the app fires an
 * SOS it lands in `reports` (kind="sos"); here we surface each recent SOS as a
 * notification enriched with the citizen's area and LAST LOGIN time (from
 * /api/users). New SOS trigger a browser notification (if permitted) + a sound
 * cue, and the bell shows an unread count.
 */
export default function EmergencyNotifications({
  reports,
  users,
  windowMinutes,
  onLocate,
}: {
  reports: Report[];
  users: DirectoryUser[];
  windowMinutes: number;
  onLocate?: (lat: number, lng: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const firstRun = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the popup on any click/tap outside it, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byNik = useMemo(() => {
    const m = new Map<string, DirectoryUser>();
    users.forEach((u) => m.set(u.nik, u));
    return m;
  }, [users]);

  // Recent SOS, newest first, enriched with area + last login.
  const notifs: SosNotif[] = useMemo(() => {
    const windowMs = windowMinutes * 60_000;
    return reports
      .filter((r) => r.kind === "sos" && r.status !== "false" && Date.now() - new Date(r.created_at).getTime() <= windowMs)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((r) => {
        const u = r.nik ? byNik.get(r.nik) : undefined;
        return {
          id: r.id,
          nik: r.nik,
          name: r.reporter_name,
          category: r.category,
          created_at: r.created_at,
          area: u?.region?.label ?? u?.area ?? r.address ?? null,
          last_login: u?.last_login ?? null,
          lat: r.lat,
          lng: r.lng,
        };
      });
  }, [reports, byNik, windowMinutes]);

  const unread = notifs.filter((n) => !seen.has(n.id));

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  // Fire a browser notification + sound for genuinely new SOS (skip the very
  // first render so we don't blast everything on page load).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      setSeen(new Set(notifs.map((n) => n.id)));
      return;
    }
    const fresh = notifs.filter((n) => !seen.has(n.id));
    if (fresh.length === 0) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      fresh.slice(0, 3).forEach((n) => {
        new Notification("🚨 SOS Darurat", {
          body: `${n.name} • ${n.category}\nDaerah: ${n.area ?? "tidak diketahui"}\nLogin terakhir: ${n.last_login ? timeAgo(n.last_login) : "belum pernah"}`,
          tag: n.id,
        });
      });
    }
    try {
      const a = new AudioContext();
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.frequency.value = 880; g.gain.value = 0.05;
      o.start(); o.stop(a.currentTime + 0.18);
    } catch { /* audio optional */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs]);

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }

  function markAllSeen() {
    setSeen(new Set(notifs.map((n) => n.id)));
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`notif-bell ${unread.length ? "has" : ""}`}
        onClick={() => { setOpen((o) => !o); if (!open) markAllSeen(); }}
        aria-label={`Notifikasi darurat${unread.length ? `, ${unread.length} baru` : ""}`}
        title="Notifikasi darurat"
      >
        <span className="msym">{unread.length ? "notifications_active" : "notifications"}</span>
        {unread.length > 0 && <span className="notif-count">{unread.length > 99 ? "99+" : unread.length}</span>}
      </button>

      {open && (
        <div className="notif-pop" role="dialog" aria-label="Notifikasi darurat">
          <div className="notif-hd">
            <strong>SOS Darurat</strong>
            <small>{windowMinutes} menit terakhir · {notifs.length} sinyal</small>
          </div>

          {permission !== "granted" && typeof Notification !== "undefined" && (
            <button className="notif-perm" onClick={askPermission}>
              <span className="msym sm">notifications</span>
              Aktifkan notifikasi desktop
            </button>
          )}

          <div className="notif-list">
            {notifs.length === 0 ? (
              <div className="notif-empty">
                <span className="msym">check_circle</span>
                Tidak ada SOS aktif. Semua aman.
              </div>
            ) : (
              notifs.map((n) => (
                <button key={n.id} className="notif-item" onClick={() => { onLocate?.(n.lat, n.lng); setOpen(false); }}>
                  <span className="dot" />
                  <div className="body">
                    <div className="top">
                      <strong>{n.name}</strong>
                      <small>{timeAgo(n.created_at)}</small>
                    </div>
                    <div className="cat">{n.category}</div>
                    <div className="meta">
                      <span><span className="msym xs">location_on</span>{n.area ?? `${n.lat.toFixed(3)}, ${n.lng.toFixed(3)}`}</span>
                      <span><span className="msym xs">schedule</span>Login {n.last_login ? timeAgo(n.last_login) : "—"}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
