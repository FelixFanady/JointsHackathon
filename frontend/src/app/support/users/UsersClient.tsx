"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { useUsers, type DirectoryUser } from "@/components/useUsers";
import { formatDateTime, timeAgo } from "@/lib/util";

type Level = "info" | "warning" | "danger";
type Mode = "all" | "region" | "picked";
type SentNotice = { id: string; to: string; to_name: string | null; title: string; message: string; level: Level; created_at: string; by: string };

const LEVELS: [Level, string, string][] = [
  ["info", "Info", "info"],
  ["warning", "Peringatan", "warning"],
  ["danger", "Darurat", "emergency_home"],
];
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
  const { users, loading, error, reload } = useUsers(15000);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [regionCity, setRegionCity] = useState(""); // table filter
  const [regionDistrict, setRegionDistrict] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // compose modal
  const [compose, setCompose] = useState(false);
  const [mode, setMode] = useState<Mode>("all");
  const [sendCity, setSendCity] = useState("");
  const [sendDistrict, setSendDistrict] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<Level>("info");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [toast, setToast] = useState("");
  const [sent, setSent] = useState<SentNotice[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadSent = () =>
    fetch("/api/notices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setSent(j.notices ?? []))
      .catch(() => {});
  useEffect(() => { loadSent(); }, []);

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
  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(""), 3200); }

  // ----- recipients for the compose modal -----
  const active = users.filter((u) => u.active);
  const regionRecipients = active.filter((u) => u.region?.city === sendCity && (!sendDistrict || u.region?.district === sendDistrict));
  const pickedRecipients = active.filter((u) => picked.has(u.nik));
  const recipients: DirectoryUser[] = mode === "all" ? active : mode === "region" ? regionRecipients : pickedRecipients;

  function openCompose(m: Mode, opts?: { picked?: string[]; city?: string; district?: string }) {
    setFormErr("");
    if (opts?.picked) setPicked(new Set(opts.picked));
    setMode(m);
    const city = opts?.city ?? (regionCity && regionCity !== "__none" ? regionCity : cities[0]?.[0] ?? "");
    setSendCity(city);
    setSendDistrict(opts?.district ?? (regionCity === city ? regionDistrict : ""));
    setCompose(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (recipients.length === 0) return setFormErr("Tidak ada penerima pada pilihan ini.");
    setBusy(true);
    setFormErr("");
    const res = await fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: mode === "all" ? "all" : recipients.map((u) => u.nik), title, message, level }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setFormErr(j.error ?? "Gagal mengirim notifikasi.");
    flash(mode === "all" ? "Notifikasi dikirim ke semua pengguna." : `Notifikasi dikirim ke ${j.sent} pengguna.`);
    setCompose(false);
    setTitle(""); setMessage(""); setLevel("info");
    setPicked(new Set());
    loadSent();
  }

  const names = (nik: string) => users.find((u) => u.nik === nik)?.full_name ?? nik;
  const modeLabel = (m: Mode) => (m === "all" ? "Semua" : m === "region" ? "Per daerah" : `Dipilih (${picked.size})`);

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
                {rows.map((u: DirectoryUser) => {
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
      </div>

      {sent.length > 0 && (
        <div className="card sent-card">
          <h2>Notifikasi terkirim</h2>
          <div className="sent-list">
            {sent.slice(0, 8).map((n) => (
              <div key={n.id} className={`sent-item ${n.level}`}>
                <div className="top"><strong>{n.title}</strong><small>{timeAgo(n.created_at)}</small></div>
                <p>{n.message}</p>
                <small className="muted">Ke: {n.to === "all" ? "Semua pengguna" : n.to_name ?? names(n.to)} · oleh {n.by}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {compose && (
        <Modal title="Kirim notifikasi" sub="Muncul di HP warga dengan bunyi dan getar seperti alarm." onClose={() => setCompose(false)}>
          <form onSubmit={submit}>
            <div className="field">
              <label>Kirim ke</label>
              <div className="tabs" role="tablist" aria-label="Penerima">
                {(["all", "region", "picked"] as Mode[]).map((m) => (
                  <button type="button" key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} disabled={m === "picked" && picked.size === 0} onClick={() => setMode(m)}>
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            {mode === "region" && (
              <div className="field">
                {cities.length === 0 ? (
                  <span className="hint">Belum ada pengguna dengan daerah yang dikenali di peta.</span>
                ) : (
                  <div className="region-pick">
                    <select className="input" value={sendCity} onChange={(e) => { setSendCity(e.target.value); setSendDistrict(""); }} aria-label="Kota atau kabupaten">
                      {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                    </select>
                    <select className="input" value={sendDistrict} onChange={(e) => setSendDistrict(e.target.value)} aria-label="Kecamatan">
                      <option value="">Semua kecamatan</option>
                      {districtsOf(sendCity).map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="recipients" aria-live="polite">
              <span className="msym sm">group</span>
              <b>{recipients.length}</b> penerima
              {mode !== "all" && recipients.length > 0 && (
                <small className="muted"> · {recipients.slice(0, 3).map((u) => u.full_name).join(", ")}{recipients.length > 3 ? ` +${recipients.length - 3}` : ""}</small>
              )}
            </div>

            <div className="field">
              <label>Tingkat</label>
              <div className="tabs" role="tablist" aria-label="Tingkat">
                {LEVELS.map(([k, label, icon]) => (
                  <button type="button" key={k} role="tab" aria-selected={level === k} className={level === k ? "on" : ""} onClick={() => setLevel(k)}>
                    <span className="msym sm">{icon}</span>{label}
                  </button>
                ))}
              </div>
              {level !== "info" && <span className="hint">Peringatan/Darurat berbunyi dan bergetar berulang sampai warga membukanya (maks. 1 menit).</span>}
            </div>
            <div className="field">
              <label htmlFor="nt">Judul</label>
              <input id="nt" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Contoh: Waspada banjir di wilayah Anda" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="nm">Pesan</label>
              <textarea id="nm" className="input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Isi pemberitahuan untuk warga…" required />
              <span className="hint">{message.length}/500</span>
            </div>
            {formErr && <div className="alert error">{formErr}</div>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setCompose(false)}>Batal</button>
              <button type="submit" className="btn primary" disabled={busy || recipients.length === 0}><span className="msym sm">send</span>{busy ? "Mengirim…" : `Kirim ke ${recipients.length}`}</button>
            </div>
          </form>
        </Modal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
