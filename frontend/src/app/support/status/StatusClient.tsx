"use client";

import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { confirmDialog } from "@/components/Dialog";
import Pager, { usePaged } from "@/components/Pager";
import {
  DURATIONS, HAZARDS, SCOPE_ALL, STATUS_LEVELS, isActive, scopeLabel, statusTitle,
  type AreaStatus, type HazardKey, type StatusLevel,
} from "@/lib/areaStatusMeta";
import { formatDateTime, timeAgo } from "@/lib/util";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", support: "Support" };
const hazardIcon = (k: HazardKey) => HAZARDS.find((h) => h.key === k)?.icon ?? "crisis_alert";

/** Status Wilayah: set an ongoing alert level for the whole country or one province, see what is active, end it. */
export default function StatusClient() {
  const [list, setList] = useState<AreaStatus[] | null>(null);
  const [canAll, setCanAll] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState("");

  const [scope, setScope] = useState("");
  const [level, setLevel] = useState<StatusLevel>("siaga");
  const [hazard, setHazard] = useState<HazardKey>("gempa");
  const [other, setOther] = useState("");
  const [message, setMessage] = useState("");
  const [hours, setHours] = useState(0);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [ending, setEnding] = useState<string | null>(null);

  const load = () =>
    fetch("/api/area-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { setList(j.statuses ?? []); setCanAll(!!j.can_all); setAreas(j.areas ?? []); setLoadErr(""); })
      .catch(() => setLoadErr("Gagal memuat status wilayah."));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  // Default area: everything for admins / ALL officers, else the officer's first province.
  useEffect(() => { if (!scope && (canAll || areas.length)) setScope(canAll ? SCOPE_ALL : areas[0]); }, [canAll, areas, scope]);

  const now = Date.now();
  const active = useMemo(() => (list ?? []).filter((s) => isActive(s, now)), [list, now]);
  const past = useMemo(() => (list ?? []).filter((s) => !isActive(s, now)), [list, now]);
  const paged = usePaged(past, null, 10);

  const hazardLabel = hazard === "lainnya" ? other.trim() : HAZARDS.find((h) => h.key === hazard)!.label;
  const title = statusTitle(level, hazardLabel || "…");
  const lv = STATUS_LEVELS.find((l) => l.key === level)!;
  const scopeOptions = [
    ...(canAll ? [{ value: SCOPE_ALL, label: "Seluruh wilayah (semua pengguna)" }] : []),
    ...areas.map((p) => ({ value: p, label: p })),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setDone("");
    if (!scope) return setErr("Pilih wilayah.");
    if (hazard === "lainnya" && hazardLabel.length < 3) return setErr("Tulis jenis bencananya.");
    const ok = await confirmDialog({
      title: `Tetapkan "${title}"?`,
      message: `Status ini langsung tampil di aplikasi warga ${scope === SCOPE_ALL ? "di seluruh wilayah" : `di ${scopeLabel(scope)}`} sampai diakhiri.`,
      details: [
        ["Wilayah", scopeLabel(scope)],
        ["Berlaku", DURATIONS.find((d) => d.hours === hours)?.label ?? ""],
        ["Notifikasi", notify ? "Juga dikirim ke HP warga di wilayah ini" : "Tidak dikirim"],
      ],
      confirmLabel: "Tetapkan status",
      tone: level === "awas" ? "danger" : "warning",
      icon: hazardIcon(hazard),
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/area-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, level, hazard, hazard_label: hazard === "lainnya" ? hazardLabel : undefined, message, duration_hours: hours, notify }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) return setErr(j.error ?? "Gagal menetapkan status.");
    const n = j.status?.notified;
    setDone(`${title} ditetapkan untuk ${scopeLabel(scope)}.${j.replaced ? " Status sebelumnya untuk bencana yang sama diganti." : ""}${n === -1 ? " Notifikasi dikirim ke semua warga." : n > 0 ? ` Notifikasi dikirim ke ${n} warga.` : n === 0 ? " Belum ada warga terdaftar di wilayah ini untuk diberi notifikasi." : ""}`);
    setMessage(""); setOther("");
    load();
  }

  async function end(s: AreaStatus) {
    const ok = await confirmDialog({
      title: `Akhiri "${s.title}"?`,
      message: "Status langsung hilang dari aplikasi warga.",
      details: [["Wilayah", scopeLabel(s.scope)], ["Sejak", formatDateTime(s.created_at)]],
      confirmLabel: "Akhiri status",
      icon: "close",
    });
    if (!ok) return;
    setEnding(s.id);
    const res = await fetch("/api/area-status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) }).catch(() => null);
    setEnding(null);
    if (!res || !res.ok) { const j = res ? await res.json().catch(() => ({})) : {}; setLoadErr(j.error ?? "Gagal mengakhiri status."); return; }
    load();
  }

  const by = (s: AreaStatus) => `${s.by}${s.by_username ? ` (@${s.by_username})` : ""}${s.by_role ? ` · ${ROLE_LABEL[s.by_role] ?? s.by_role}` : ""}`;

  return (
    <>
      {/* What citizens see right now */}
      <section className="card st-active" aria-label="Status aktif">
        <div className="st-head">
          <h2>Status aktif</h2>
          <span className="badge slate">{list === null ? "…" : active.length}</span>
        </div>
        {loadErr && <div className="alert error">{loadErr}</div>}
        {list === null ? (
          <div className="empty"><span className="msym spin">progress_activity</span>Memuat…</div>
        ) : active.length === 0 ? (
          <div className="empty"><span className="msym">verified</span>Tidak ada status aktif. Semua wilayah berstatus normal.</div>
        ) : (
          <div className="st-list">
            {active.map((s) => (
              <article key={s.id} className={`st-item ${s.level}`}>
                <span className="st-ic msym">{hazardIcon(s.hazard)}</span>
                <div className="st-body">
                  <div className="st-top">
                    <b>{s.title}</b>
                    <span className="st-area"><span className="msym xs">location_on</span>{scopeLabel(s.scope)}</span>
                  </div>
                  {s.message && <p>{s.message}</p>}
                  <small>
                    Sejak {formatDateTime(s.created_at)} ({timeAgo(s.created_at)}) · {s.ends_at ? `berakhir ${formatDateTime(s.ends_at)}` : "sampai diakhiri"} · oleh {by(s)}
                  </small>
                </div>
                <button className="btn ghost sm" onClick={() => end(s)} disabled={ending === s.id}>
                  <span className="msym sm">close</span>{ending === s.id ? "Mengakhiri…" : "Akhiri"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="compose-grid">
        <form id="status-form" className="card compose-form" onSubmit={submit}>
          <section className="cf-sec">
            <div className="field">
              <label>Wilayah</label>
              {scopeOptions.length ? (
                <Select value={scope} onChange={setScope} aria-label="Wilayah" options={scopeOptions} />
              ) : (
                <span className="hint">Anda belum ditugaskan ke wilayah mana pun.</span>
              )}
            </div>
          </section>
          <section className="cf-sec">
            <div className="field">
              <label>Tingkat status</label>
              <div className="cat-pick" role="radiogroup" aria-label="Tingkat status">
                {STATUS_LEVELS.map((l) => (
                  <button type="button" key={l.key} role="radio" aria-checked={level === l.key} className={`cat st-${l.key} ${level === l.key ? "on" : ""}`} onClick={() => setLevel(l.key)}>
                    <span className="msym sm">{l.icon}</span>
                    <b>{l.label}</b>
                    <small>{l.desc}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Jenis bencana</label>
              <div className="hz-pick" role="radiogroup" aria-label="Jenis bencana">
                {HAZARDS.map((h) => (
                  <button type="button" key={h.key} role="radio" aria-checked={hazard === h.key} className={hazard === h.key ? "on" : ""} onClick={() => setHazard(h.key)}>
                    <span className="msym">{h.icon}</span>{h.label}
                  </button>
                ))}
              </div>
              {hazard === "lainnya" && (
                <input className="input" value={other} onChange={(e) => setOther(e.target.value)} maxLength={40} placeholder="Contoh: Angin Puting Beliung" aria-label="Jenis bencana lainnya" />
              )}
            </div>
          </section>
          <section className="cf-sec">
            <div className="field">
              <label htmlFor="sm">Arahan untuk warga <span className="muted">(opsional)</span></label>
              <textarea id="sm" className="input notice-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={lv.desc} />
              <span className="hint counter">{message.length}/500</span>
            </div>
            <div className="field">
              <label>Berlaku</label>
              <Select value={hours} onChange={setHours} aria-label="Lama berlaku" options={DURATIONS.map((d) => ({ value: d.hours, label: d.label }))} />
            </div>
            <label className="check-row">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>Kirim juga notifikasi ke HP warga di wilayah ini{level !== "waspada" ? " (dengan sirene bencana)" : ""}</span>
            </label>
          </section>
        </form>

        <aside className="card compose-preview" aria-label="Pratinjau di aplikasi warga">
          <h2>Pratinjau di aplikasi warga</h2>
          <div className={`st-banner ${level}`}>
            <span className="sb-ic msym">{hazardIcon(hazard)}</span>
            <div className="sb-main">
              <div className="sb-top">
                <span className={`badge st-${level}`}>{lv.label}</span>
                <small>baru saja</small>
              </div>
              <b>{title}</b>
              <span className="sb-area"><span className="msym xs">location_on</span>{scopeLabel(scope || SCOPE_ALL)}</span>
              <p>{message || lv.desc}</p>
            </div>
          </div>
          <dl className="pv-meta">
            <dt>Wilayah</dt><dd>{scope ? scopeLabel(scope) : "–"}</dd>
            <dt>Berlaku</dt><dd>{DURATIONS.find((d) => d.hours === hours)?.label}</dd>
            <dt>Notifikasi</dt><dd>{notify ? "Dikirim ke warga di wilayah ini" : "Tidak dikirim"}</dd>
          </dl>
          <div className="pv-send">
            {err && <div className="alert error">{err}</div>}
            {done && <div className="alert ok"><span className="msym sm">check_circle</span><span>{done}</span></div>}
            <button type="submit" form="status-form" className="btn primary" disabled={busy || !scope || (hazard === "lainnya" && hazardLabel.length < 3)}>
              <span className="msym sm">campaign</span>{busy ? "Menetapkan…" : "Tetapkan status"}
            </button>
          </div>
        </aside>
      </div>

      {past.length > 0 && (
        <section className="card st-past" aria-label="Riwayat status">
          <div className="st-head"><h2>Riwayat status</h2></div>
          <div className="notif-log">
            {paged.slice.map((s) => (
              <article key={s.id} className={`log-item ${s.level === "waspada" ? "warning" : "danger"}`}>
                <div className="lg-top">
                  <span className={`badge st-${s.level}`}>{s.level.toUpperCase()}</span>
                  <span className="badge slate">{scopeLabel(s.scope)}</span>
                  <time dateTime={s.created_at}>{formatDateTime(s.created_at)}</time>
                </div>
                <h3>{s.title}</h3>
                {s.message && <p className="msg">{s.message}</p>}
                <div className="lg-meta">
                  <span><span className="msym xs">person</span>Dibuat oleh <b>{by(s)}</b></span>
                  <span><span className="msym xs">schedule</span>
                    {s.ended_at
                      ? `${s.ended_reason === "replaced" ? "Diganti status baru" : "Diakhiri"} ${formatDateTime(s.ended_at)}${s.ended_by && s.ended_reason !== "replaced" ? ` oleh ${s.ended_by}` : ""}`
                      : `Berakhir otomatis ${s.ends_at ? formatDateTime(s.ends_at) : ""}`}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <Pager {...paged} label="status" />
        </section>
      )}
    </>
  );
}
