"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUsers, type DirectoryUser } from "@/components/useUsers";
import { formatDateTime, timeAgo } from "@/lib/util";
import Pager, { usePaged } from "@/components/Pager";

const FILTERS = [
  ["all", "Semua"],
  ["online", "Aktif 15 mnt"],
  ["app", "App terhubung"],
  ["never", "Belum pernah login"],
] as const;

const ONLINE_MS = 15 * 60_000;
const initials = (n: string) => n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
const recent = (iso: string | null, ms: number) => !!iso && Date.now() - +new Date(iso) < ms;

/** Distinct values with counts, biggest first. */
function tally(values: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  values.forEach((v) => v && m.set(v, (m.get(v) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function UsersClient() {
  const router = useRouter();
  const { users, loading, error, reload } = useUsers(15000);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [regionCity, setRegionCity] = useState(""); // table filter
  const [regionDistrict, setRegionDistrict] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [toast] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Ask the server to resolve districts/cities from the street map (OpenStreetMap) for users
  // that don't have one yet. It does a few per call (service allows ~1 req/s), so loop until done.
  const synced = useRef(false);
  const pendingCount = users.filter((u) => u.region_pending).length;
  useEffect(() => {
    if (synced.current || loading || pendingCount === 0) return;
    synced.current = true;
    let stop = false;
    (async () => {
      setSyncing(true);
      for (let i = 0; i < 40 && !stop; i++) {
        const r = await fetch("/api/users/sync-regions", { method: "POST" }).catch(() => null);
        const j = r && r.ok ? await r.json().catch(() => null) : null;
        if (!j) break;
        if (j.resolved > 0) reload();
        if (j.remaining <= 0 || j.resolved === 0) break;
      }
      if (!stop) { setSyncing(false); reload(); }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pendingCount]);

  const cities = useMemo(() => tally(users.map((u) => u.region?.city)), [users]);
  const districtsOf = (city: string) => tally(users.filter((u) => u.region?.city === city).map((u) => u.region?.district));
  const unknownRegion = users.filter((u) => !u.region).length;

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return users
      .filter((u) => !n || `${u.full_name} ${u.area ?? ""} ${u.region?.label ?? ""} ${u.phone ?? ""} ${u.nik_masked}`.toLowerCase().includes(n))
      .filter((u) =>
        filter === "online" ? recent(u.last_login, ONLINE_MS)
        : filter === "app" ? !!u.notices_fetched_at
        : filter === "never" ? !u.last_login
        : true,
      )
      .filter((u) => (!regionCity ? true : regionCity === "__none" ? !u.region : u.region?.city === regionCity))
      .filter((u) => !regionDistrict || u.region?.district === regionDistrict)
      .sort((a, b) => (+new Date(b.last_login ?? 0)) - (+new Date(a.last_login ?? 0)));
  }, [users, q, filter, regionCity, regionDistrict]);

  const paged = usePaged(rows, [q, filter, regionCity, regionDistrict]);

  const onlineCount = users.filter((u) => recent(u.last_login, ONLINE_MS)).length;
  const appCount = users.filter((u) => u.notices_fetched_at).length;
  const allPicked = rows.length > 0 && rows.every((u) => picked.has(u.nik));

  function toggle(nik: string) {
    setPicked((p) => { const n = new Set(p); n.has(nik) ? n.delete(nik) : n.add(nik); return n; });
  }
  function toggleAll() {
    setPicked((p) => {
      const n = new Set(p);
      if (allPicked) rows.forEach((u) => n.delete(u.nik)); else rows.forEach((u) => n.add(u.nik));
      return n;
    });
  }
  const names = (nik: string) => users.find((u) => u.nik === nik)?.full_name ?? nik;
  void names;

  // Sending now lives on its own page (Notifikasi › Buat Notifikasi); these open it pre-filled.
  function openCompose(m: "all" | "region" | "picked", opts?: { picked?: string[] }) {
    const p = new URLSearchParams();
    if (m === "picked") p.set("to", (opts?.picked ?? [...picked]).join(","));
    if (m === "region" && regionCity && regionCity !== "__none") {
      p.set("city", regionCity);
      if (regionDistrict) p.set("district", regionDistrict);
    }
    router.push(`/support/notifications/new${p.size ? `?${p}` : ""}`);
  }

  return (
    <>
      <div className="report-stats" aria-label="Ringkasan pengguna">
        <button className={`stat ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}><b>{users.length}</b><span>Terdaftar</span></button>
        <button className={`stat ok ${filter === "online" ? "on" : ""}`} onClick={() => setFilter("online")}><b>{onlineCount}</b><span><span className="msym xs">circle</span>Aktif 15 mnt</span></button>
        <button className={`stat ${filter === "app" ? "on" : ""}`} onClick={() => setFilter("app")}><b>{appCount}</b><span><span className="msym xs">smartphone</span>App terhubung</span></button>
        <button className={`stat warn ${filter === "never" ? "on" : ""}`} onClick={() => setFilter("never")}><b>{users.filter((u) => !u.last_login).length}</b><span><span className="msym xs">person_off</span>Belum login</span></button>
      </div>

      <div className="toolbar">
        <input className="input search grow" placeholder="Cari nama, daerah, atau HP…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pengguna" />
        <select className="input select-sm" value={regionCity} onChange={(e) => { setRegionCity(e.target.value); setRegionDistrict(""); }} aria-label="Filter kota atau kabupaten">
          <option value="">Semua daerah</option>
          {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          {unknownRegion > 0 && <option value="__none">Daerah belum diketahui ({unknownRegion})</option>}
        </select>
        {regionCity && regionCity !== "__none" && (
          <select className="input select-sm" value={regionDistrict} onChange={(e) => setRegionDistrict(e.target.value)} aria-label="Filter kecamatan">
            <option value="">Semua kecamatan</option>
            {districtsOf(regionCity).map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
          </select>
        )}
        <button className="icon-btn refresh" onClick={reload} aria-label="Muat ulang" title="Muat ulang"><span className={`msym ${loading ? "spin" : ""}`}>refresh</span></button>
        <button className="btn primary" onClick={() => openCompose(regionCity && regionCity !== "__none" ? "region" : "all")} disabled={users.length === 0}>
          <span className="msym sm">campaign</span>Kirim pesan
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Filter" style={{ marginBottom: 12 }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {syncing && (
        <div className="bulk-bar" role="status"><span className="msym spin">sync</span>Menentukan daerah dari peta (OpenStreetMap)… {pendingCount > 0 && <b>{pendingCount} tersisa</b>}</div>
      )}

      {picked.size > 0 && (
        <div className="bulk-bar" role="status">
          <b>{picked.size}</b> pengguna dipilih
          <button className="btn primary sm" onClick={() => openCompose("picked")}><span className="msym sm">send</span>Kirim notifikasi</button>
          <button className="linklike" onClick={() => setPicked(new Set())}>Batal pilih</button>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {loading && users.length === 0 ? (
            <div className="empty"><span className="msym">hourglass_empty</span>Memuat pengguna…</div>
          ) : rows.length === 0 ? (
            <div className="empty"><span className="msym">person_off</span>Tidak ada pengguna pada filter ini.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" aria-label="Pilih semua" checked={allPicked} onChange={toggleAll} style={{ accentColor: "#1d4ed8" }} /></th>
                  <th>Pengguna</th>
                  <th>Daerah (peta)</th>
                  <th>Login terakhir</th>
                  <th>App</th>
                  <th>Status</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((u: DirectoryUser) => {
                  const on = recent(u.last_login, ONLINE_MS);
                  return (
                    <tr key={u.nik}>
                      <td><input type="checkbox" aria-label={`Pilih ${u.full_name}`} checked={picked.has(u.nik)} onChange={() => toggle(u.nik)} style={{ accentColor: "#1d4ed8" }} /></td>
                      <td>
                        <div className="person">
                          {u.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="av" src={u.photo} alt="" width={36} height={36} />
                          ) : (
                            <div className="av">{initials(u.full_name)}</div>
                          )}
                          <div>
                            {u.full_name}
                            <small className="mono">{u.nik_masked}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.region ? (
                          <div className="stack">
                            <span title={u.region.province ?? ""}>
                              <span className="msym xs" title={u.region.source === "gps" ? "Dari lokasi GPS terakhir" : "Dari alamat profil"}>{u.region.source === "gps" ? "my_location" : "home_pin"}</span> {u.region.label}
                            </span>
                            {u.area && <span className="muted addr" title={u.area}>{u.area}</span>}
                          </div>
                        ) : u.region_pending ? (
                          <span className="muted">Menentukan…</span>
                        ) : u.area ? (
                          <div className="stack"><span className="muted">Tidak dikenali di peta</span><span className="muted addr" title={u.area}>{u.area}</span></div>
                        ) : (
                          <span className="muted">Belum diisi</span>
                        )}
                      </td>
                      <td>
                        <span className="nowrap"><span className={`presence-dot ${on ? "on" : u.last_login ? "idle" : "off"}`} />{u.last_login ? timeAgo(u.last_login) : "belum pernah"}</span>
                      </td>
                      <td>
                        {u.notices_fetched_at
                          ? <span className="badge valid" title={`Terakhir tarik inbox: ${formatDateTime(u.notices_fetched_at)}`}><span className="msym xs">smartphone</span>Terhubung</span>
                          : <span className="badge off" title="App belum pernah mengambil notifikasi">Belum</span>}
                      </td>
                      <td><span className={`badge ${u.active ? "valid" : "off"}`}>{u.active ? "Aktif" : "Nonaktif"}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {u.last_lat != null && u.last_lng != null && (
                          <Link className="icon-btn" href={`/support/map?focus=${u.last_lat},${u.last_lng}`} aria-label={`Lihat ${u.full_name} di peta`} title="Lihat di peta"><span className="msym sm">my_location</span></Link>
                        )}
                        <button className="icon-btn" disabled={!u.active} onClick={() => openCompose("picked", { picked: [u.nik] })} aria-label={`Kirim notifikasi ke ${u.full_name}`} title="Kirim notifikasi"><span className="msym sm">send</span></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="pengguna" />
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
