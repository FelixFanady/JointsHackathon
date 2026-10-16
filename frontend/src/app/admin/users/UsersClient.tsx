"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { alertDialog } from "@/components/Dialog";
import { formatDateTime } from "@/lib/util";
import type { Profile, Role } from "@/lib/types";
import { ALL_AREAS, areaLabel } from "@/lib/provinces";
import Pager, { usePaged } from "@/components/Pager";
import RowMenu, { type RowMenuItem } from "@/components/RowMenu";
import { AreaPicker, FacePanel } from "@/components/StaffPanels";

type RoleTab = "all" | Role;
const ROLE_TABS: [RoleTab, string][] = [
  ["all", "Semua"],
  ["admin", "Admin"],
  ["support", "Support"],
];

const EMPTY = {
  full_name: "",
  username: "",
  unit: "",
  password: "",
  confirm_password: "",
};

const EMPTY_SUPPORT = { full_name: "", username: "", unit: "", password: "" };

export type StaffRow = Profile & {
  face: "exempt" | "registered" | "none";
  face_at: string | null;
  face_locked: number;
  root: boolean;
  super: boolean;
  bypass: boolean;
  areas: string[];
};

type Manage = { kind: "password" | "active" | "super" | "bypass"; p: StaffRow };
type SupportMode = { kind: "add" } | { kind: "areas" | "face" | "delete"; p: StaffRow } | null;

function FaceBadge({ p }: { p: StaffRow }) {
  if (p.face === "exempt") return <span className="badge off" title="Akun darurat: dikecualikan dari verifikasi wajah">Dikecualikan</span>;
  if (p.bypass) return <span className="badge pending" title="Bypass demo aktif: tidak diminta verifikasi wajah">Bypass</span>;
  if (p.face === "none") return <span className="badge pending" title="Akan diminta mendaftarkan wajah saat login berikutnya">Belum terdaftar</span>;
  return (
    <span className="face-cell">
      <span className="badge valid" title={p.face_at ? `Terdaftar ${formatDateTime(p.face_at)}` : undefined}>
        <span className="msym xs">verified</span>Terdaftar
      </span>
      {p.face_locked > 0 && <span className="badge false">Terkunci · {p.face_locked} mnt</span>}
    </span>
  );
}

export default function UsersClient({
  initial,
  meId,
  meSuper,
}: {
  initial: StaffRow[];
  meId: string;
  meSuper: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<RoleTab>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [manage, setManage] = useState<Manage | null>(null);
  const [mpass, setMpass] = useState("");
  const [mconfirm, setMconfirm] = useState("");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openManage(kind: Manage["kind"], p: StaffRow) {
    setMpass("");
    setMconfirm("");
    setError("");
    setManage({ kind, p });
  }

  async function submitManage(e: React.FormEvent) {
    e.preventDefault();
    if (!manage) return;
    const { kind, p } = manage;
    const viaSupportApi = p.role === "support" && (kind === "password" || kind === "active");
    const body: Record<string, unknown> = viaSupportApi ? {} : { confirm_password: mconfirm };
    if (kind === "password") body.password = mpass;
    if (kind === "active") body.active = !p.active;
    if (kind === "super") body.super = !p.super;
    if (kind === "bypass") body.bypass = !p.bypass;
    setBusy(true);
    setError("");
    const url = kind === "bypass" ? `/api/admin/staff/${p.id}/bypass` : viaSupportApi ? `/api/admin/support/${p.id}` : `/api/admin/users/${p.id}`;
    const res = await fetch(url, {
      method: kind === "bypass" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Permintaan gagal.");
      setMconfirm("");
      return;
    }
    setManage(null);
    setToast(
      kind === "password"
        ? `Kata sandi ${p.full_name} diganti.`
        : kind === "active"
          ? `${p.full_name} ${p.active ? "dinonaktifkan" : "diaktifkan"}.`
          : kind === "bypass"
            ? `Bypass verifikasi wajah ${p.full_name} ${p.bypass ? "dimatikan" : "diaktifkan"}.`
            : `${p.full_name} ${p.super ? "bukan lagi" : "sekarang"} Super Administrator.`,
    );
    window.setTimeout(() => setToast(""), 3000);
    router.refresh();
  }

  const genMpw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const buf = crypto.getRandomValues(new Uint32Array(16));
    setMpass(Array.from(buf, (n) => chars[n % chars.length]).join(""));
  };

  const [sup, setSup] = useState<SupportMode>(null);
  const [sform, setSform] = useState(EMPTY_SUPPORT);
  const [sareas, setSareas] = useState<string[]>([ALL_AREAS]);

  function openSupport(m: SupportMode) {
    setSform(EMPTY_SUPPORT);
    setSareas(m && m.kind === "areas" ? m.p.areas : [ALL_AREAS]);
    setError("");
    setSup(m);
  }

  async function supportCall(url: string, method: string, body: unknown | undefined, okMsg: string) {
    setBusy(true);
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Permintaan gagal.");
      return;
    }
    setSup(null);
    setToast(okMsg);
    window.setTimeout(() => setToast(""), 3000);
    router.refresh();
  }

  const genSpw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const buf = crypto.getRandomValues(new Uint32Array(14));
    setSform((f) => ({ ...f, password: Array.from(buf, (n) => chars[n % chars.length]).join("") }));
  };

  function menuFor(p: StaffRow): RowMenuItem[] {
    const items: RowMenuItem[] = [];
    if (p.role === "support" || (meSuper && (!p.root || p.id === meId))) {
      items.push({ label: "Ganti kata sandi", icon: "key", onClick: () => openManage("password", p) });
    }
    if (p.role === "support" || (meSuper && !p.root && p.id !== meId)) {
      items.push({
        label: p.active ? "Nonaktifkan akun" : "Aktifkan akun",
        icon: p.active ? "person_off" : "check_circle",
        danger: p.active,
        onClick: () => openManage("active", p),
      });
    }
    if (meSuper && p.role === "admin" && !p.root) {
      items.push({
        label: p.super ? "Cabut Super Administrator" : "Jadikan Super Administrator",
        icon: p.super ? "verified" : "shield",
        onClick: () => openManage("super", p),
      });
    }
    if (p.face !== "exempt") {
      items.push({ label: "Foto wajah", icon: "photo_camera", onClick: () => openSupport({ kind: "face", p }) });
    }
    if (p.role === "support") {
      items.push({ label: "Atur wilayah tugas", icon: "map", onClick: () => openSupport({ kind: "areas", p }) });
    }
    if (p.face === "registered") {
      items.push({
        label: "Reset wajah",
        icon: "refresh",
        onClick: () => {
          setError("");
          setResetting(p);
        },
      });
    }
    if (p.role === "support") {
      items.push({ label: "Hapus akun", icon: "delete", danger: true, onClick: () => openSupport({ kind: "delete", p }) });
    }
    return items;
  }

  async function resetFace() {
    if (!resetting) return;
    const p = resetting;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/staff/${p.id}/face-reset`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Permintaan gagal.");
      return;
    }
    setResetting(null);
    setToast(`Wajah ${p.full_name} direset. Ia akan diminta mendaftar ulang saat login.`);
    window.setTimeout(() => setToast(""), 3000);
    router.refresh();
  }

  const counts = useMemo(
    () => ({
      all: initial.length,
      admin: initial.filter((p) => p.role === "admin").length,
      support: initial.filter((p) => p.role === "support").length,
    }),
    [initial],
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return initial.filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (!s ||
          p.full_name.toLowerCase().includes(s) ||
          p.username.includes(s) ||
          (p.unit ?? "").toLowerCase().includes(s)),
    );
  }, [initial, role, q]);
  const paged = usePaged(rows, [role, q]);

  function openAdd() {
    setForm(EMPTY);
    setError("");
    setAdding(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) {
      setAdding(false);
      setForm(EMPTY);
      setRole("admin");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Permintaan gagal.");
    setForm((f) => ({ ...f, confirm_password: "" }));
  }

  const genPw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const buf = crypto.getRandomValues(new Uint32Array(16));
    setForm((f) => ({
      ...f,
      password: Array.from(buf, (n) => chars[n % chars.length]).join(""),
    }));
  };

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Peran">
          {ROLE_TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={role === k}
              className={role === k ? "on" : ""}
              onClick={() => setRole(k)}
            >
              {label} <span style={{ opacity: 0.6 }}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <input
          className="input search grow"
          placeholder="Cari nama, username, unit…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari akun"
        />
        <button className="btn" onClick={() => openSupport({ kind: "add" })}>
          <span className="msym sm">support_agent</span>Buat akun support
        </button>
        <button className="btn primary" onClick={openAdd}>
          <span className="msym sm">person_add</span>Buat admin baru
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {rows.length === 0 ? (
            <div className="empty">
              <span className="msym">group</span>
              {initial.length
                ? "Tidak ada akun yang cocok."
                : "Belum ada akun staf."}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Username</th>
                  <th>Peran</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Wajah</th>
                  <th>Bypass</th>
                  <th>Dibuat</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="person">
                        <span className="av">
                          {p.full_name
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </span>
                        {p.full_name}
                        {p.id === meId && (
                          <span
                            className="badge report"
                            style={{ marginLeft: 6 }}
                          >
                            Anda
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono">{p.username}</td>
                    <td>
                      {p.super ? (
                        <span
                          className="badge pending"
                          title={p.root ? "Akun utama (Super Administrator)" : "Super Administrator: hak penuh seperti akun utama"}
                        >
                          <span className="msym xs">shield</span>Super Admin
                        </span>
                      ) : (
                        <span
                          className={`badge ${p.role === "admin" ? "report" : "valid"}`}
                        >
                          {p.role === "admin" ? "Admin" : "Support"}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.unit ?? "-"}
                      {p.role === "support" && (
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge ${p.areas.includes(ALL_AREAS) ? "report" : p.areas.length ? "valid" : "off"}`} title={p.areas.join(", ") || "Belum ditugaskan"}>
                            {areaLabel(p.areas)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`state-pill ${p.active ? "on" : "off"}`}>
                        <i aria-hidden />
                        {p.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td><FaceBadge p={p} /></td>
                    <td>
                      {p.face === "exempt" ? (
                        <span className="muted">—</span>
                      ) : meSuper ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.bypass}
                          aria-label={`${p.bypass ? "Matikan" : "Aktifkan"} bypass verifikasi wajah ${p.full_name}`}
                          title={p.bypass ? "Bypass aktif — klik untuk mematikan" : "Klik untuk bypass verifikasi wajah (demo)"}
                          className={`switch${p.bypass ? " on" : ""}`}
                          onClick={() => openManage("bypass", p)}
                        >
                          <span className="knob" />
                        </button>
                      ) : (
                        <span className={`badge ${p.bypass ? "pending" : "off"}`}>{p.bypass ? "Aktif" : "Mati"}</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} title={p.created_at ? formatDateTime(p.created_at) : undefined}>
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                        : "-"}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <RowMenu label={`Aksi untuk ${p.full_name}`} items={menuFor(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="akun" />
      </div>

      {resetting && (
        <Modal
          title="Reset wajah?"
          sub={`Foto wajah ${resetting.full_name} (${resetting.username}) dihapus dan kunci percobaannya dibuka. Saat login berikutnya ia wajib mendaftarkan wajah lagi. Lakukan hanya jika Anda yakin orangnya benar.`}
          onClose={() => setResetting(null)}
        >
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions">
            <button className="btn" onClick={() => setResetting(null)}>Batal</button>
            <button className="btn danger" disabled={busy} onClick={resetFace}>{busy ? "Mereset…" : "Ya, reset wajah"}</button>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {manage && (
        <Modal
          title={
            manage.kind === "password"
              ? `Ganti kata sandi ${manage.p.full_name}`
              : manage.kind === "bypass"
                ? manage.p.bypass ? "Matikan bypass verifikasi wajah?" : "Aktifkan bypass verifikasi wajah?"
                : manage.kind === "active"
                  ? manage.p.active ? `Nonaktifkan ${manage.p.role === "admin" ? "admin" : "akun support"}?` : `Aktifkan ${manage.p.role === "admin" ? "admin" : "akun support"}?`
                  : manage.p.super ? "Cabut Super Administrator?" : "Jadikan Super Administrator?"
          }
          sub={
            manage.kind === "password"
              ? `Kata sandi baru untuk ${manage.p.username}. Bagikan secara aman; sesi yang sedang berjalan baru berakhir saat token-nya kedaluwarsa.`
              : manage.kind === "bypass"
                ? manage.p.bypass
                  ? `${manage.p.full_name} (${manage.p.username}) kembali wajib verifikasi wajah pada akses berikutnya.`
                  : `${manage.p.full_name} (${manage.p.username}) bisa masuk dan melakukan tindakan sensitif tanpa verifikasi wajah. Pakai hanya untuk demo/penjurian dan matikan setelahnya.`
                : manage.kind === "active"
                ? manage.p.active
                  ? `${manage.p.full_name} (${manage.p.username}) tidak akan bisa masuk dan sesinya langsung ditolak. Akun tidak dihapus.`
                  : `${manage.p.full_name} (${manage.p.username}) bisa masuk lagi.`
                : manage.p.super
                  ? `${manage.p.full_name} kembali menjadi admin biasa dan tidak bisa lagi mengganti kata sandi atau menonaktifkan admin lain.`
                  : `${manage.p.full_name} mendapat hak yang sama dengan akun utama: mengganti kata sandi admin, menonaktifkan admin, dan menunjuk Super Administrator lain. Berikan hanya ke orang yang benar-benar dipercaya.`
          }
          onClose={() => setManage(null)}
        >
          <form onSubmit={submitManage} autoComplete="off">
            {error && <div className="alert error" role="alert">{error}</div>}
            {manage.kind === "password" && (
              <div className="field">
                <label htmlFor="mpw">Kata sandi baru</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="mpw"
                    className="input"
                    value={mpass}
                    onChange={(e) => setMpass(e.target.value)}
                    minLength={manage.p.role === "support" ? 8 : 10}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                    autoFocus
                  />
                  <button type="button" className="btn" onClick={genMpw}>Acak</button>
                </div>
                <span className="hint">Minimal {manage.p.role === "support" ? 8 : 10} karakter.</span>
              </div>
            )}
            {!(manage.p.role === "support" && (manage.kind === "password" || manage.kind === "active")) && (
              <div className="field">
                <label htmlFor="mcf">Kata sandi Anda (konfirmasi)</label>
                <input
                  id="mcf"
                  type="password"
                  className="input"
                  value={mconfirm}
                  onChange={(e) => setMconfirm(e.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus={manage.kind !== "password"}
                />
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setManage(null)}>Batal</button>
              <button
                className={`btn ${manage.kind === "active" && manage.p.active ? "danger" : "primary"}`}
                disabled={busy}
              >
                {busy
                  ? "Memproses…"
                  : manage.kind === "password"
                    ? "Ganti kata sandi"
                    : manage.kind === "bypass"
                      ? manage.p.bypass ? "Ya, matikan bypass" : "Ya, aktifkan bypass"
                      : manage.kind === "active"
                      ? manage.p.active ? "Ya, nonaktifkan" : "Ya, aktifkan"
                      : manage.p.super ? "Ya, cabut" : "Ya, jadikan Super"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {sup?.kind === "add" && (
        <Modal title="Buat akun support" sub="Bagikan username dan kata sandi ini ke petugas secara aman." onClose={() => setSup(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void supportCall("/api/admin/support", "POST", { ...sform, areas: sareas }, `Akun support ${sform.full_name} dibuat.`);
            }}
            autoComplete="off"
          >
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field"><label htmlFor="sfn">Nama lengkap</label><input id="sfn" className="input" value={sform.full_name} onChange={(e) => setSform({ ...sform, full_name: e.target.value })} required autoFocus /></div>
            <div className="field"><label htmlFor="sun">Username</label><input id="sun" className="input" value={sform.username} onChange={(e) => setSform({ ...sform, username: e.target.value.toLowerCase() })} autoCapitalize="none" required /><span className="hint">3-32 karakter: a-z, 0-9, titik, strip, garis bawah.</span></div>
            <div className="field"><label htmlFor="sut">Unit / satuan tugas</label><input id="sut" className="input" value={sform.unit} onChange={(e) => setSform({ ...sform, unit: e.target.value })} placeholder="Contoh: Call Center 112" /></div>
            <div className="field">
              <label htmlFor="spw">Kata sandi sementara</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="spw" className="input" value={sform.password} onChange={(e) => setSform({ ...sform, password: e.target.value })} minLength={8} maxLength={72} autoComplete="new-password" required />
                <button type="button" className="btn" onClick={genSpw}>Acak</button>
              </div>
              <span className="hint">Minimal 8 karakter.</span>
            </div>
            <div className="field"><label>Wilayah tugas</label><AreaPicker value={sareas} onChange={setSareas} /></div>
            <div className="actions"><button type="button" className="btn" onClick={() => setSup(null)}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Membuat…" : "Buat akun"}</button></div>
          </form>
        </Modal>
      )}

      {sup?.kind === "areas" && (
        <Modal title="Wilayah tugas" sub={`${sup.p.full_name} hanya melihat laporan, peta, dan warga di wilayah ini.`} onClose={() => setSup(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void supportCall(`/api/admin/support/${sup.p.id}`, "PATCH", { areas: sareas }, `Wilayah ${sup.p.full_name} disimpan.`);
            }}
          >
            {error && <div className="alert error" role="alert">{error}</div>}
            <AreaPicker value={sareas} onChange={setSareas} />
            <div className="actions"><button type="button" className="btn" onClick={() => setSup(null)}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
          </form>
        </Modal>
      )}

      {sup?.kind === "face" && (
        <Modal title="Foto wajah petugas" sub={`${sup.p.full_name} (${sup.p.username})`} onClose={() => setSup(null)}>
          <FacePanel
            p={sup.p}
            onDone={(msg) => {
              setSup(null);
              router.refresh();
              void alertDialog({ title: "Berhasil", message: msg, icon: "check_circle" });
            }}
          />
        </Modal>
      )}

      {sup?.kind === "delete" && (
        <Modal title="Hapus akun support?" sub={`${sup.p.full_name} (${sup.p.username}) tidak bisa login lagi. Riwayat verifikasinya akan kehilangan nama petugas.`} onClose={() => setSup(null)}>
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions">
            <button className="btn" onClick={() => setSup(null)}>Batal</button>
            <button className="btn danger" disabled={busy} onClick={() => void supportCall(`/api/admin/support/${sup.p.id}`, "DELETE", undefined, `${sup.p.full_name} dihapus.`)}>{busy ? "Menghapus…" : "Ya, hapus"}</button>
          </div>
        </Modal>
      )}

      {adding && (
        <Modal
          title="Buat admin baru"
          sub="Admin punya akses penuh: membuat/menghapus akun staf dan melihat semua data warga. Buat hanya untuk orang yang benar-benar dipercaya."
          onClose={() => setAdding(false)}
        >
          <form onSubmit={submit} autoComplete="off">
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="afn">Nama lengkap</label>
              <input
                id="afn"
                className="input"
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="aun">Username</label>
              <input
                id="aun"
                className="input"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.toLowerCase() })
                }
                autoCapitalize="none"
                required
              />
              <span className="hint">
                3-32 karakter: a-z, 0-9, titik, strip, garis bawah. Boleh berupa
                email.
              </span>
            </div>
            <div className="field">
              <label htmlFor="aut">Unit / jabatan</label>
              <input
                id="aut"
                className="input"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="Contoh: BPBD Provinsi"
              />
            </div>
            <div className="field">
              <label htmlFor="apw">Kata sandi sementara</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="apw"
                  className="input"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  minLength={10}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="btn" onClick={genPw}>
                  Acak
                </button>
              </div>
              <span className="hint">
                Minimal 10 karakter. Bagikan ke admin baru secara aman.
              </span>
            </div>
            <div className="field">
              <label htmlFor="acf">Kata sandi Anda (konfirmasi)</label>
              <input
                id="acf"
                type="password"
                className="input"
                value={form.confirm_password}
                onChange={(e) =>
                  setForm({ ...form, confirm_password: e.target.value })
                }
                autoComplete="current-password"
                required
              />
              <span className="hint">Verifikasi status admin anda.</span>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => setAdding(false)}
              >
                Batal
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Membuat…" : "Buat admin"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
