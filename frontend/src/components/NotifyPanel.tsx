"use client";

import { useCallback, useEffect, useState } from "react";
import Select from "./Select";
import { confirmDialog } from "./Dialog";
import type { Report } from "@/lib/types";
import type { NoticeKind } from "@/lib/citizenNotice";
import {
  DEFAULT_RADIUS_KM,
  NEARBY_RADIUS_OPTIONS_KM,
  NOTICE_MESSAGE_MAX,
  defaultNoticeText,
  kindForCategory,
  type BmkgQuake,
  type ReportNoticeLog,
} from "@/lib/reportNotice";
import { timeAgo } from "@/lib/util";

type Info = { log: ReportNoticeLog[]; active: number; nearby: Record<string, number>; quake: BmkgQuake | null };

const KINDS: [NoticeKind, string, string, string][] = [
  ["bencana", "Bencana alam", "tsunami", "Sirene peringatan bencana berbunyi 30 detik, notifikasi muncul satu kali."],
  ["kriminal", "Kriminal", "local_police", "Bunyi sirene polisi satu kali dan satu kali getar."],
  ["umum", "Umum", "notifications", "Bunyi notifikasi biasa satu kali."],
];
const KIND_LABEL: Record<NoticeKind, string> = { bencana: "Bencana alam", kriminal: "Kriminal", umum: "Umum" };

export default function NotifyPanel({ report, aiRunning = false }: { report: Report; aiRunning?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [scope, setScope] = useState<"nearby" | "all">("nearby");
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_KM);
  const [kind, setKind] = useState<NoticeKind>(() => kindForCategory(report.category));
  const [title, setTitle] = useState(() => defaultNoticeText(report, kindForCategory(report.category)).title);
  const [message, setMessage] = useState(() => defaultNoticeText(report, kindForCategory(report.category)).message);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/reports/notify?id=${encodeURIComponent(report.id)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setLoadErr(j.error ?? "Gagal memuat data penerima.");
      setInfo(j as Info);
      setLoadErr("");
    } catch {
      setLoadErr("Tidak dapat terhubung ke server.");
    }
  }, [report.id]);
  useEffect(() => { load(); }, [aiRunning, load]);

  const quakeSig = info?.quake ? `${info.quake.waktu}|${info.quake.wilayah}` : "";
  useEffect(() => {
    if (edited || !info) return;
    const t = defaultNoticeText(report, kind, info.quake);
    setTitle(t.title);
    setMessage(t.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quakeSig, !!info]);

  function pickKind(k: NoticeKind) {
    setKind(k);
    if (!edited) {
      const t = defaultNoticeText(report, k, info?.quake);
      setTitle(t.title);
      setMessage(t.message);
    }
  }

  const count = scope === "all" ? info?.active ?? 0 : info?.nearby[String(radius)] ?? 0;
  const already = (info?.log.length ?? 0) > 0;
  const kindHint = KINDS.find(([k]) => k === kind)?.[3] ?? "";

  async function send() {
    setErr("");
    setDone("");
    if (count === 0) return setErr(scope === "all" ? "Belum ada warga aktif." : `Tidak ada warga dalam radius ${radius} km.`);
    const who = scope === "all" ? `SEMUA warga (${count} orang)` : `${count} warga dalam radius ${radius} km`;
    const ok = await confirmDialog({
      title: `Kirim notifikasi "${KIND_LABEL[kind]}"?`,
      details: [["Penerima", who], ["Bunyi", kindHint]],
      note: already ? "Notifikasi untuk laporan ini SUDAH pernah dikirim." : undefined,
      confirmLabel: "Kirim notifikasi",
      tone: "danger",
      icon: "campaign",
    });
    if (!ok) return;
    setBusy(true);
    const r = await fetch("/api/reports/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: report.id, scope, radius_km: radius, kind, level: "danger", title, message, force: already }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setErr(j.error ?? "Gagal mengirim notifikasi.");
    setDone(j.scope === "all" ? `Notifikasi dikirim ke semua warga (${j.sent}).` : `Notifikasi dikirim ke ${j.sent} warga dalam radius ${j.radius_km} km.`);
    if (j.log) setInfo((i) => (i ? { ...i, log: j.log } : i));
  }

  return (
    <section className="notify-box" aria-label="Kirim notifikasi ke warga">
      <div className="hd"><span className="msym sm">campaign</span>Kirim peringatan ke warga</div>

      {info && info.log.length > 0 && (() => {
        const last = info.log[info.log.length - 1];
        const summary = (l: ReportNoticeLog) =>
          `${KIND_LABEL[l.kind]} · ${l.scope === "all" ? `semua warga (${l.recipients})` : `${l.recipients} warga, radius ${l.radius_km} km`} · oleh ${l.by}`;
        return (
          <div className="alert ok notify-sent">
            <span className="msym sm">check_circle</span>
            <div>
              <b>{info.log.length > 1 ? `Sudah dikirim ${info.log.length} kali` : "Sudah dikirim"}</b>
              <div>Terakhir {timeAgo(last.sent_at)} · {summary(last)}</div>
              {last.note && <div className="muted">{last.note}</div>}
              {info.log.length > 1 && (
                <details>
                  <summary>Lihat riwayat</summary>
                  <ol>
                    {info.log.map((l, i) => <li key={`${l.sent_at}-${i}`}>{timeAgo(l.sent_at)} · {summary(l)}</li>)}
                  </ol>
                </details>
              )}
            </div>
          </div>
        );
      })()}

      <div className="field">
        <label>Penerima</label>
        <div className="tabs" role="tablist" aria-label="Penerima">
          <button type="button" role="tab" aria-selected={scope === "nearby"} className={scope === "nearby" ? "on" : ""} onClick={() => setScope("nearby")}>
            <span className="msym sm">near_me</span>Warga terdekat
          </button>
          <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            <span className="msym sm">groups</span>Semua warga
          </button>
        </div>
        {scope === "nearby" && (
          <Select value={radius} onChange={setRadius} aria-label="Radius dari lokasi kejadian"
            options={NEARBY_RADIUS_OPTIONS_KM.map((km) => ({ value: km, label: `Radius ${km} km`, hint: info ? `${info.nearby[String(km)] ?? 0} warga` : undefined }))} />
        )}
        <span className="hint">
          {!info ? "Menghitung penerima…" : scope === "nearby" ? `${count} warga berdasarkan lokasi terakhir dari aplikasi.` : `${count} warga aktif.`}
        </span>
      </div>

      <div className="field">
        <label>Jenis kejadian</label>
        <div className="tabs" role="tablist" aria-label="Jenis kejadian">
          {KINDS.map(([k, label, icon]) => (
            <button type="button" key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => pickKind(k)}>
              <span className="msym sm">{icon}</span>{label}
            </button>
          ))}
        </div>
        <span className="hint">{kindHint}</span>
      </div>

      <div className="field">
        <label htmlFor={`nt-${report.id}`}>Judul</label>
        <input id={`nt-${report.id}`} className="input" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setEdited(true); }} />
      </div>
      <div className="field">
        <label htmlFor={`nm-${report.id}`}>Pesan</label>
        <textarea id={`nm-${report.id}`} className="input notice-msg" rows={12} value={message} maxLength={NOTICE_MESSAGE_MAX} onChange={(e) => { setMessage(e.target.value); setEdited(true); }} />
        <span className="hint">{message.length}/{NOTICE_MESSAGE_MAX} · Baris baru dan tanda • tampil apa adanya di HP warga.</span>
      </div>

      {loadErr && <div className="alert error">{loadErr}</div>}
      {err && <div className="alert error">{err}</div>}
      {done && <div className="alert ok">{done}</div>}

      {aiRunning && (
        <div className="alert warn" role="status">
          <span className="msym sm spin">progress_activity</span>
          <span>AI sedang memeriksa dan bisa mengirim peringatan otomatis. Tunggu sampai selesai agar tidak terkirim dua kali.</span>
        </div>
      )}
      <button className="btn primary" style={{ width: "100%" }} disabled={aiRunning || busy || !info || count === 0 || title.trim().length < 2 || message.trim().length < 2} onClick={send}>
        <span className="msym sm">send</span>
        {busy ? "Mengirim…" : `${already ? "Kirim lagi" : "Kirim notifikasi"} ke ${scope === "all" ? "semua warga" : "warga terdekat"} (${count})`}
      </button>
    </section>
  );
}
