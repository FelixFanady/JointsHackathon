"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Pager, { usePaged } from "@/components/Pager";
import { formatDateTime } from "@/lib/util";

export type LogRow = {
  id: number;
  subject: string;
  display_name: string | null;
  role: string | null;
  method: "nik" | "password" | "face_verify" | "face_enroll";
  success: boolean;
  reason: string | null;
  ip: string | null;
  region: string | null;
  country: string | null;
  user_agent: string | null;
  created_at: string;
};

const METHOD: Record<LogRow["method"], string> = {
  nik: "NIK",
  password: "Password",
  face_verify: "Verifikasi wajah",
  face_enroll: "Daftar wajah",
};

const REASON: Record<string, string> = {
  wrong_credentials: "Username/password salah",
  invalid_input: "Input tidak valid",
  inactive: "Akun nonaktif",
  no_profile: "Profil tidak ada",
  nik_not_found: "NIK tidak terdaftar",
  invalid_nik: "Format NIK salah",
  locked: "Terkunci (terlalu banyak gagal)",
  cv_unavailable: "Servis CV tidak tersedia",
  enrolled: "Wajah didaftarkan",
  no_face: "Wajah tidak terdeteksi",
  multiple_faces: "Lebih dari satu wajah",
  face_too_small: "Wajah terlalu jauh",
  face_cut_off: "Wajah terpotong",
  face_unclear: "Wajah kurang jelas",
  too_dark: "Terlalu gelap",
  too_bright: "Terlalu terang",
  blurry: "Foto buram",
  reference_unusable: "Foto referensi rusak",
};

function reasonLabel(r: string | null): string {
  if (!r) return "";
  const m = /^(match|face_mismatch) (\d+)%$/.exec(r);
  if (m) return m[1] === "match" ? `Cocok · ${m[2]}%` : `Wajah tidak cocok · ${m[2]}%`;
  return REASON[r] ?? r;
}

function device(ua: string | null): string {
  if (!ua) return "-";
  if (/dart/i.test(ua)) return "App SiagaKu";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl/i.test(ua) ? "curl" : "";
  return [br, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

const TABS = [
  ["all", "Semua"],
  ["ok", "Valid"],
  ["fail", "False"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function LoginLogsClient({ rows, kind, missing }: { rows: LogRow[]; kind: "citizen" | "staff"; missing: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [method, setMethod] = useState<"all" | LogRow["method"]>("all");
  const [q, setQ] = useState("");

  const methods = useMemo<LogRow["method"][]>(() => (kind === "staff" ? ["password", "face_verify", "face_enroll"] : ["nik", "face_verify", "face_enroll"]), [kind]);
  const base = useMemo(() => rows.filter((r) => method === "all" || r.method === method), [rows, method]);
  const counts = useMemo(() => ({ all: base.length, ok: base.filter((r) => r.success).length, fail: base.filter((r) => !r.success).length }), [base]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return base.filter((r) => {
      if (tab === "ok" && !r.success) return false;
      if (tab === "fail" && r.success) return false;
      if (!s) return true;
      return [r.subject, r.display_name, r.ip, r.region, r.country].some((v) => v?.toLowerCase().includes(s));
    });
  }, [base, tab, q]);
  const paged = usePaged(filtered, [tab, method, q], 20);

  if (missing) {
    return (
      <div className="alert error" role="alert">
        Tabel <code>login_logs</code> belum ada di database. Jalankan isi file <code>frontend/supabase/login_logs.sql</code> di Supabase → SQL Editor, lalu muat ulang halaman ini.
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Hasil login">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label} <span style={{ opacity: 0.6 }}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Metode">
          <button role="tab" aria-selected={method === "all"} className={method === "all" ? "on" : ""} onClick={() => setMethod("all")}>Semua metode</button>
          {methods.map((m) => (
            <button key={m} role="tab" aria-selected={method === m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{METHOD[m]}</button>
          ))}
        </div>
        <input
          className="input search grow"
          placeholder={kind === "staff" ? "Cari nama, username, IP, daerah…" : "Cari nama, NIK, IP, daerah…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari log"
        />
        <button className="btn" onClick={() => router.refresh()}><span className="msym sm">refresh</span>Muat ulang</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty"><span className="msym">login</span>{rows.length ? "Tidak ada log yang cocok." : "Belum ada aktivitas login."}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>{kind === "staff" ? "Akun" : "Warga"}</th>
                  <th>Metode</th>
                  <th>Hasil</th>
                  <th>IP</th>
                  <th>Daerah</th>
                  <th>Perangkat</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="log-who">
                        <b>{r.display_name ?? "Tidak dikenal"}</b>
                        <span className="mono">{r.subject}{r.role ? ` · ${r.role}` : ""}</span>
                      </div>
                    </td>
                    <td>{METHOD[r.method] ?? r.method}</td>
                    <td>
                      <div className="log-result">
                        <span className={`badge ${r.success ? "valid" : "false"}`}>{r.success ? "Valid" : "False"}</span>
                        {r.reason && <small>{reasonLabel(r.reason)}</small>}
                      </div>
                    </td>
                    <td className="mono">{r.ip ?? "-"}</td>
                    <td>{[r.region, r.country].filter(Boolean).join(" · ") || "-"}</td>
                    <td title={r.user_agent ?? undefined}>{device(r.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="log" />
      </div>
    </>
  );
}
