"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "@/lib/types";
import type { DirectoryUser } from "@/components/useUsers";
import { reportCode, timeAgo } from "@/lib/util";

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

// ---- "already alerted" memory, shared by every tab and kept across reloads/page switches ----
// Each SOS rings + pops a desktop notification exactly ONCE per browser, no matter how often the
// list re-polls, the page remounts, or several console tabs are open.
const NOTIFIED_KEY = "siagaku_sos_notified";
const SEEN_KEY = "siagaku_sos_seen";
const MAX_REMEMBERED = 400;

function loadIds(key: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function saveIds(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].slice(-MAX_REMEMBERED)));
  } catch { /* storage full / disabled: in-memory only */ }
}

// ---- alert sound (Web Audio, no file to load) ----
let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audioCtx ??= new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}
// Browsers only allow sound after the user has interacted with the page once: unlock on the first click/key.
if (typeof window !== "undefined") {
  const unlock = () => { ctx()?.resume().catch(() => {}); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/**
 * Emergency chime: two rising "ding-dong-DING" phrases (~1.6 s), a bell-like tone (sine + soft
 * overtone, quick attack, smooth decay). Urgent but not harsh, and clearly different from a UI click.
 */
function playSosChime() {
  const a = ctx();
  if (!a) return;
  if (a.state === "suspended") a.resume().catch(() => {});
  const master = a.createGain();
  master.gain.value = 0.22;
  master.connect(a.destination);
  const bell = (freq: number, at: number, dur: number) => {
    for (const [mult, vol] of [[1, 1], [2.01, 0.28], [3.02, 0.08]] as const) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(master);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  };
  const t = a.currentTime + 0.02;
  for (const off of [0, 0.82]) {
    bell(784, t + off, 0.5); // G5
    bell(988, t + off + 0.16, 0.5); // B5
    bell(1319, t + off + 0.32, 0.75); // E6
  }
}

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
  loaded = true,
}: {
  reports: Report[];
  /** False until the first SOS fetch finished (so an empty initial list is not taken as the baseline). */
  loaded?: boolean;
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

  // Restore read state (badge) from earlier visits / other tabs.
  useEffect(() => {
    setSeen(loadIds(SEEN_KEY));
    const onStorage = (e: StorageEvent) => { if (e.key === SEEN_KEY) setSeen(loadIds(SEEN_KEY)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Alert ONCE per SOS. `notified` (localStorage) is separate from `seen` (opened the bell), so a
  // re-poll or a page switch never re-alerts an SOS that already rang. On the very first load we only
  // record what is there, so opening the console does not blast every recent SOS.
  useEffect(() => {
    if (!loaded) return;
    const notified = loadIds(NOTIFIED_KEY);
    if (firstRun.current) {
      firstRun.current = false;
      if (!localStorage.getItem(NOTIFIED_KEY)) {
        notifs.forEach((n) => notified.add(n.id));
        saveIds(NOTIFIED_KEY, notified);
        return;
      }
    }
    const fresh = notifs.filter((n) => !notified.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => notified.add(n.id));
    saveIds(NOTIFIED_KEY, notified); // claim first, so another open tab does not ring for the same SOS
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      fresh.slice(0, 3).forEach((n) => {
        new Notification("🚨 SOS Darurat", {
          body: `${n.name} • ${n.category}\nDaerah: ${n.area ?? "tidak diketahui"}\nLogin terakhir: ${n.last_login ? timeAgo(n.last_login) : "belum pernah"}`,
          tag: n.id, // the browser also collapses repeats of the same SOS
        });
      });
    }
    try { playSosChime(); } catch { /* audio optional */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs, loaded]);

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }

  function markAllSeen() {
    const next = new Set([...loadIds(SEEN_KEY), ...notifs.map((n) => n.id)]);
    saveIds(SEEN_KEY, next);
    setSeen(next);
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
                    <div className="cat">{n.category} <span className="rid mono">{reportCode({ id: n.id, kind: "sos" })}</span></div>
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
