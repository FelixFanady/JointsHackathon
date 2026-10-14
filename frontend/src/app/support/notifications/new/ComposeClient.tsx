"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUsers, type DirectoryUser } from "@/components/useUsers";
import { NOTICE_CATEGORIES, NOTICE_KINDS, type NoticeKindKey, type NoticeLevelKey } from "@/lib/noticeMeta";

type Mode = "all" | "region" | "picked";

/** Distinct values with counts, biggest first. */
function tally(values: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  values.forEach((v) => v && m.set(v, (m.get(v) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const MESSAGE_MAX = 800;

/** Notifikasi › Buat Notifikasi: push a notification to citizens' phones. */
export default function ComposeClient() {
  const sp = useSearchParams();
  const { users, loading } = useUsers(60000, { photos: false });

  const [mode, setMode] = useState<Mode>("all");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickQ, setPickQ] = useState("");
  const [level, setLevel] = useState<NoticeLevelKey>("info");
  const [kind, setKind] = useState<NoticeKindKey>("umum");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  // Pre-fill from the Users page: ?to=nik,nik  or  ?city=…&district=…
  useEffect(() => {
    const to = sp.get("to");
    const c = sp.get("city");
    if (to) {
      setPicked(new Set(to.split(",").filter((n) => /^\d{16}$/.test(n))));
      setMode("picked");
    } else if (c) {
      setCity(c);
      setDistrict(sp.get("district") ?? "");
      setMode("region");
    }
  }, [sp]);

  const active = useMemo(() => users.filter((u) => u.active), [users]);
  const cities = useMemo(() => tally(active.map((u) => u.region?.city)), [active]);
  const districts = useMemo(() => tally(active.filter((u) => u.region?.city === city).map((u) => u.region?.district)), [active, city]);
  useEffect(() => { if (mode === "region" && !city && cities[0]) setCity(cities[0][0]); }, [mode, city, cities]);

  const recipients: DirectoryUser[] =
    mode === "all" ? active
    : mode === "region" ? active.filter((u) => u.region?.city === city && (!district || u.region?.district === district))
    : active.filter((u) => picked.has(u.nik));

  const pickList = useMemo(() => {
    const n = pickQ.trim().toLowerCase();
    return active.filter((u) => !n || `${u.full_name} ${u.region?.label ?? ""} ${u.nik_masked}`.toLowerCase().includes(n)).slice(0, 60);
  }, [active, pickQ]);

  const targetLabel =
    mode === "all" ? "Semua warga"
    : mode === "region" ? `Per daerah: ${district ? `${district}, ` : ""}${city}`
    : `${recipients.length} warga dipilih`;

  const cat = NOTICE_CATEGORIES.find((c) => c.key === level)!;
  const kindInfo = NOTICE_KINDS.find((k) => k.key === kind)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setDone("");
    if (recipients.length === 0) return setErr("Tidak ada penerima pada pilihan ini.");
    if (!window.confirm(`Kirim notifikasi ${cat.label.toUpperCase()} (${kindInfo.label}) ke ${mode === "all" ? `SEMUA warga (${recipients.length})` : `${recipients.length} warga`}?\n\n${kindInfo.sound}`)) return;
    setBusy(true);
    const res = await fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: mode === "all" ? "all" : recipients.map((u) => u.nik), title, message, level, kind, target_label: targetLabel }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) return setErr(j.error ?? "Gagal mengirim notifikasi.");
    setDone(mode === "all" && j.broadcast ? "Notifikasi dikirim ke semua warga." : `Notifikasi dikirim ke ${j.sent} warga.`);
    setTitle(""); setMessage(""); setPicked(new Set());
  }

  return (
    <div className="compose-grid">
      <form className="card compose-form" onSubmit={submit}>
        <div className="field">
          <label>Kategori</label>
          <div className="cat-pick" role="radiogroup" aria-label="Kategori notifikasi">
            {NOTICE_CATEGORIES.map((c) => (
              <button type="button" key={c.key} role="radio" aria-checked={level === c.key} className={`cat ${c.key} ${level === c.key ? "on" : ""}`} onClick={() => setLevel(c.key)}>
                <span className="msym sm">{c.icon}</span>
                <b>{c.label}</b>
                <small>{c.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Jenis kejadian (menentukan bunyi di HP)</label>
          <div className="tabs" role="tablist" aria-label="Jenis kejadian">
            {NOTICE_KINDS.map((k) => (
              <button type="button" key={k.key} role="tab" aria-selected={kind === k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
                <span className="msym sm">{k.icon}</span>{k.label}
              </button>
            ))}
          </div>
          <span className="hint">{kindInfo.sound}</span>
        </div>

        <div className="field">
          <label>Penerima</label>
          <div className="tabs" role="tablist" aria-label="Penerima">
            {([["all", "Semua warga"], ["region", "Per daerah"], ["picked", "Pilih warga"]] as [Mode, string][]).map(([m, l]) => (
              <button type="button" key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{l}</button>
            ))}
          </div>
          {mode === "region" && (
            cities.length === 0 ? (
              <span className="hint">Belum ada warga dengan daerah yang dikenali di peta.</span>
            ) : (
              <div className="region-pick">
                <select className="input" value={city} onChange={(e) => { setCity(e.target.value); setDistrict(""); }} aria-label="Kota atau kabupaten">
                  {cities.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                </select>
                <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Kecamatan">
                  <option value="">Semua kecamatan</option>
                  {districts.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
                </select>
              </div>
            )
          )}
          {mode === "picked" && (
            <div className="pick-box">
              <input className="input" placeholder="Cari nama atau daerah…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} aria-label="Cari warga" />
              <div className="pick-list" role="group" aria-label="Pilih warga">
                {loading && users.length === 0 ? (
                  <span className="hint">Memuat warga…</span>
                ) : pickList.length === 0 ? (
                  <span className="hint">Tidak ada warga yang cocok.</span>
                ) : (
                  pickList.map((u) => (
                    <label key={u.nik}>
                      <input type="checkbox" checked={picked.has(u.nik)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(u.nik) ? n.delete(u.nik) : n.add(u.nik); return n; })} />
                      <span>{u.full_name}<small>{u.region?.label ?? u.nik_masked}</small></span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <div className="recipients" aria-live="polite">
            <span className="msym sm">group</span>
            <b>{recipients.length}</b> penerima
            {mode !== "all" && recipients.length > 0 && (
              <small className="muted"> · {recipients.slice(0, 3).map((u) => u.full_name).join(", ")}{recipients.length > 3 ? ` +${recipients.length - 3}` : ""}</small>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="nt">Judul</label>
          <input id="nt" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Contoh: Waspada banjir di wilayah Anda" required />
        </div>
        <div className="field">
          <label htmlFor="nm">Pesan</label>
          <textarea id="nm" className="input notice-msg" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MESSAGE_MAX} placeholder="Isi pemberitahuan untuk warga… (baris baru dan tanda • tampil apa adanya di HP)" required />
          <span className="hint">{message.length}/{MESSAGE_MAX}</span>
        </div>

        {err && <div className="alert error">{err}</div>}
        {done && <div className="alert ok"><span className="msym sm">check_circle</span><span>{done} <Link href="/support/notifications">Lihat riwayat</Link></span></div>}
        <button type="submit" className="btn primary" disabled={busy || recipients.length === 0 || title.trim().length < 2 || message.trim().length < 2}>
          <span className="msym sm">send</span>{busy ? "Mengirim…" : `Kirim ke ${recipients.length} warga`}
        </button>
      </form>

      {/* Live preview of the phone notification */}
      <aside className="card compose-preview" aria-label="Pratinjau di HP warga">
        <h2>Pratinjau di HP warga</h2>
        <div className={`phone-notif ${level}`}>
          <div className="pn-hd"><span className="msym xs">shield</span>SiagaKu · sekarang</div>
          <b>{level === "danger" ? "🚨 " : level === "warning" ? "⚠️ " : ""}{title || "Judul notifikasi"}</b>
          <p>{message || "Isi pesan akan tampil di sini."}</p>
        </div>
        <dl className="pv-meta">
          <dt>Kategori</dt><dd><span className={`badge lvl-${level}`}>{cat.label}</span></dd>
          <dt>Bunyi</dt><dd>{kindInfo.sound}</dd>
          <dt>Penerima</dt><dd>{targetLabel} ({recipients.length})</dd>
        </dl>
      </aside>
    </div>
  );
}
