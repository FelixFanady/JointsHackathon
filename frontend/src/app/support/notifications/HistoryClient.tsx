"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Pager, { usePaged } from "@/components/Pager";
import { KIND_LABEL, LEVEL_LABEL, type NoticeKindKey, type NoticeLevelKey } from "@/lib/noticeMeta";
import { formatDateTime, timeAgo } from "@/lib/util";

type Batch = {
  id: string;
  title: string;
  message: string;
  level: NoticeLevelKey;
  kind: NoticeKindKey | null;
  created_at: string;
  by: string;
  by_username: string | null;
  by_role: string | null;
  source: "manual" | "report" | "auto";
  to_all: boolean;
  recipients: number;
  to_names: string[];
  target_label: string | null;
};

const SOURCE_LABEL = { manual: "Halaman Notifikasi", report: "Dari laporan", auto: "Otomatis (AI + BMKG)" } as const;
const ROLE_LABEL: Record<string, string> = { admin: "Admin", support: "Support", system: "Sistem" };

/** Notifikasi › Riwayat: every push, newest first, with who sent it. */
export default function HistoryClient() {
  const [items, setItems] = useState<Batch[] | null>(null);
  const [scope, setScope] = useState<"all" | "own">("all");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"all" | NoticeLevelKey>("all");
  const [source, setSource] = useState<"all" | Batch["source"]>("all");

  const load = () =>
    fetch("/api/notices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { setItems(j.notices ?? []); setScope(j.scope ?? "all"); setErr(""); })
      .catch(() => setErr("Gagal memuat riwayat notifikasi."));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items ?? []).filter(
      (b) =>
        (level === "all" || b.level === level) &&
        (source === "all" || b.source === source) &&
        (!n || `${b.title} ${b.message} ${b.by} ${b.by_username ?? ""} ${b.target_label ?? ""}`.toLowerCase().includes(n)),
    );
  }, [items, q, level, source]);
  const paged = usePaged(rows, [q, level, source]);
  const count = (l: NoticeLevelKey) => (items ?? []).filter((b) => b.level === l).length;

  return (
    <>
      <div className="report-stats four" aria-label="Ringkasan notifikasi">
        <button className={`stat ${level === "all" ? "on" : ""}`} onClick={() => setLevel("all")}><b>{items?.length ?? "–"}</b><span>Total dikirim</span></button>
        <button className={`stat bad ${level === "danger" ? "on" : ""}`} onClick={() => setLevel("danger")}><b>{count("danger")}</b><span><span className="msym xs">emergency_home</span>Darurat</span></button>
        <button className={`stat warn ${level === "warning" ? "on" : ""}`} onClick={() => setLevel("warning")}><b>{count("warning")}</b><span><span className="msym xs">warning</span>Sedang</span></button>
        <button className={`stat ${level === "info" ? "on" : ""}`} onClick={() => setLevel("info")}><b>{count("info")}</b><span><span className="msym xs">info</span>Info</span></button>
      </div>

      <div className="toolbar">
        <input className="input search grow" placeholder="Cari judul, isi, pengirim, penerima…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari notifikasi" />
        <select className="input select-sm" value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Sumber">
          <option value="all">Semua sumber</option>
          <option value="manual">Halaman Notifikasi</option>
          <option value="report">Dari laporan</option>
          <option value="auto">Otomatis (AI + BMKG)</option>
        </select>
        <Link className="btn primary" href="/support/notifications/new"><span className="msym sm">add</span>Buat notifikasi</Link>
      </div>
      {scope === "own" && <p className="hint" style={{ marginBottom: 12 }}>Menampilkan notifikasi yang Anda kirim sendiri.</p>}
      {err && <div className="alert error">{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        {items === null ? (
          <div className="empty"><span className="msym spin">progress_activity</span>Memuat riwayat…</div>
        ) : rows.length === 0 ? (
          <div className="empty"><span className="msym">notifications</span>{items.length ? "Tidak ada notifikasi pada filter ini." : "Belum ada notifikasi yang dikirim."}</div>
        ) : (
          <div className="notif-log">
            {paged.slice.map((b) => (
              <article key={b.id} className={`log-item ${b.level}`}>
                <div className="lg-top">
                  <span className={`badge lvl-${b.level}`}>{LEVEL_LABEL[b.level] ?? b.level}</span>
                  {b.kind && <span className="badge off">{KIND_LABEL[b.kind]}</span>}
                  <span className="badge slate">{SOURCE_LABEL[b.source]}</span>
                  <time dateTime={b.created_at} title={formatDateTime(b.created_at)}>{timeAgo(b.created_at)} · {formatDateTime(b.created_at)}</time>
                </div>
                <h3>{b.title}</h3>
                <p className="msg">{b.message}</p>
                <div className="lg-meta">
                  <span><span className="msym xs">group</span>
                    {b.to_all ? "Semua warga" : b.target_label ?? `${b.recipients} warga`}
                    {!b.to_all && <> · {b.recipients} penerima{b.to_names.length ? ` (${b.to_names.join(", ")}${b.recipients > b.to_names.length ? ", …" : ""})` : ""}</>}
                  </span>
                  <span><span className="msym xs">person</span>Dibuat oleh <b>{b.by}</b>{b.by_username ? ` (@${b.by_username})` : ""}{b.by_role ? ` · ${ROLE_LABEL[b.by_role] ?? b.by_role}` : ""}</span>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pager {...paged} label="notifikasi" />
      </div>
    </>
  );
}
