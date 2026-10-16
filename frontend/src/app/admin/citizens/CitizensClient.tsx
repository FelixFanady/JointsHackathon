"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import AddressPicker from "@/components/AddressPicker";
import { formatDateTime, maskNik } from "@/lib/util";
import { compressImage, dataUriKb } from "@/lib/image";
import type { Citizen } from "@/lib/types";
import Pager, { usePaged } from "@/components/Pager";

type ProfileForm = {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  address: string;
  photo: string | null;
};

function toForm(c: Citizen): ProfileForm {
  return {
    full_name: c.full_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    birth_date: c.birth_date ?? "",
    address: c.address ?? "",
    photo: c.photo ?? null,
  };
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function formatBirth(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  const label = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? `${label} (${age} th)` : label;
}

export default function CitizensClient({
  initial,
  locks = {},
  meSuper = false,
  bypassed = [],
}: {
  initial: Citizen[];
  locks?: Record<string, number>;
  meSuper?: boolean;
  bypassed?: string[];
}) {
  const router = useRouter();
  const [bypassing, setBypassing] = useState<Citizen | null>(null);
  const [bypassPw, setBypassPw] = useState("");
  const bypassSet = useMemo(() => new Set(bypassed), [bypassed]);
  const [q, setQ] = useState("");
  const [onlyLocked, setOnlyLocked] = useState(false);
  const [unlocking, setUnlocking] = useState<Citizen | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Citizen | null>(null);
  const [editing, setEditing] = useState<Citizen | null>(null);
  const [viewing, setViewing] = useState<Citizen | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const lockOf = (c: Citizen) => (unlocked.has(c.nik) ? 0 : locks[c.nik] ?? 0);
  const lockedCount = initial.filter((c) => lockOf(c) > 0).length;

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = onlyLocked ? initial.filter((c) => !unlocked.has(c.nik) && (locks[c.nik] ?? 0) > 0) : initial;
    return n
      ? base.filter(
          (c) =>
            c.nik.startsWith(n) ||
            c.full_name.toLowerCase().includes(n) ||
            (c.email ?? "").toLowerCase().includes(n) ||
            (c.phone ?? "").includes(n),
        )
      : base;
  }, [initial, q, onlyLocked, locks, unlocked]);
  const paged = usePaged(rows, [q, onlyLocked]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function call(url: string, method: string, body?: unknown): Promise<string | null> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    return (await res.json().catch(() => ({}))).error ?? "Permintaan gagal.";
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await call("/api/admin/citizens", "POST", { nik, full_name: name });
    setBusy(false);
    if (err) return setError(err);
    setAdding(false);
    setNik("");
    setName("");
    flash("NIK ditambahkan.");
    router.refresh();
  }

  function openEdit(c: Citizen) {
    setError("");
    setPin(null);
    setEditing(c);
    setForm(toForm(c));
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !form) return;
    setPhotoBusy(true);
    setError("");
    try {
      const uri = await compressImage(file, { maxEdge: 256, quality: 0.72 });
      setForm({ ...form, photo: uri });
      flash(`Foto dikompres (~${dataUriKb(uri)} KB).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !form) return;
    setBusy(true);
    setError("");
    const err = await call(`/api/admin/citizens/${editing.nik}`, "PATCH", {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      birth_date: form.birth_date,
      address: form.address,
      photo: form.photo,
      ...(pin ? { pin } : {}),
    });
    setBusy(false);
    if (err) return setError(err);
    setEditing(null);
    setForm(null);
    flash("Profil diperbarui.");
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const err = await call(`/api/admin/citizens/${deleting.nik}`, "DELETE");
    setBusy(false);
    if (err) return setError(err);
    setDeleting(null);
    flash("NIK dihapus.");
    router.refresh();
  }

  async function submitBypass(e: React.FormEvent) {
    e.preventDefault();
    if (!bypassing) return;
    const c = bypassing;
    const next = !bypassSet.has(c.nik);
    setBusy(true);
    setError("");
    const err = await call(`/api/admin/citizens/${c.nik}/bypass`, "POST", { bypass: next, confirm_password: bypassPw });
    setBusy(false);
    if (err) {
      setBypassPw("");
      return setError(err);
    }
    setBypassing(null);
    flash(next ? `Bypass verifikasi wajah ${c.full_name} diaktifkan.` : `Bypass verifikasi wajah ${c.full_name} dimatikan.`);
    router.refresh();
  }

  async function unlock() {
    if (!unlocking) return;
    const c = unlocking;
    setBusy(true);
    setError("");
    const err = await call(`/api/admin/citizens/${c.nik}/unlock`, "POST");
    setBusy(false);
    if (err) return setError(err);
    setUnlocking(null);
    setUnlocked((s) => new Set(s).add(c.nik));
    flash(`Verifikasi wajah ${c.full_name} dibuka kembali.`);
    router.refresh();
  }

  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [rowFlash, setRowFlash] = useState<Record<string, "on" | "off">>({});
  const isActive = (c: Citizen) => flags[c.nik] ?? c.active;

  async function toggle(c: Citizen) {
    if (pending.has(c.nik)) return;
    const next = !isActive(c);
    setFlags((f) => ({ ...f, [c.nik]: next }));
    setPending((p) => new Set(p).add(c.nik));
    const err = await call(`/api/admin/citizens/${c.nik}`, "PATCH", { active: next });
    setPending((p) => { const n = new Set(p); n.delete(c.nik); return n; });
    if (err) {
      setFlags((f) => ({ ...f, [c.nik]: !next }));
      flash(err);
      return;
    }
    setRowFlash((r) => ({ ...r, [c.nik]: next ? "on" : "off" }));
    window.setTimeout(() => setRowFlash((r) => { const n = { ...r }; delete n[c.nik]; return n; }), 1100);
    flash(next ? `${c.full_name} diaktifkan — bisa login ke app.` : `${c.full_name} dinonaktifkan — tidak bisa login ke app.`);
    router.refresh();
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="input search grow"
          placeholder="Cari NIK, nama, email, atau HP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari pengguna"
        />
        {(lockedCount > 0 || onlyLocked) && (
          <button
            type="button"
            className={`btn sm${onlyLocked ? " danger" : ""}`}
            aria-pressed={onlyLocked}
            onClick={() => setOnlyLocked((v) => !v)}
            title="Tampilkan hanya NIK yang verifikasi wajahnya terkunci"
          >
            <span className="msym sm">block</span>
            {onlyLocked ? "Tampilkan semua" : `${lockedCount} wajah terkunci`}
          </button>
        )}
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setAdding(true);
          }}
        >
          <span className="msym sm">add</span>Tambah NIK
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {rows.length === 0 ? (
            <div className="empty">
              <span className="msym">badge</span>Belum ada NIK terdaftar.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Kontak</th>
                  <th>Lahir</th>
                  <th>Alamat</th>
                  <th>Status</th>
                  <th>Bypass wajah</th>
                  <th>Dibuat</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((c) => {
                  const on = isActive(c);
                  return (
                  <tr key={c.nik} className={`${on ? "" : "row-off"} ${rowFlash[c.nik] ? `flash-${rowFlash[c.nik]}` : ""}`}>
                    <td>
                      <div className="person">
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="av clickable" src={c.photo} alt={`Foto ${c.full_name}`} width={36} height={36} onClick={() => setViewing(c)} />
                        ) : (
                          <div className="av">{initials(c.full_name)}</div>
                        )}
                        <div>
                          {c.full_name}
                          <small className="mono">{maskNik(c.nik)}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.phone || c.email ? (
                        <div className="stack">
                          {c.phone && <span><span className="msym xs">call</span> {c.phone}</span>}
                          {c.email && <span className="muted"><span className="msym xs">mail</span> {c.email}</span>}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{c.birth_date ? <span className="nowrap">{formatBirth(c.birth_date)}</span> : <span className="muted">—</span>}</td>
                    <td>{c.address ? <span className="addr" title={c.address}>{c.address}</span> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="status-cell">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${on ? "Nonaktifkan" : "Aktifkan"} ${c.full_name}`}
                          title={on ? "Klik untuk menonaktifkan" : "Klik untuk mengaktifkan"}
                          className={`switch${on ? " on" : ""}${pending.has(c.nik) ? " busy" : ""}`}
                          onClick={() => toggle(c)}
                        >
                          <span className="knob" />
                        </button>
                        <span className={`badge ${on ? "valid" : "off"}`}>{on ? "Aktif" : "Nonaktif"}</span>
                        {lockOf(c) > 0 && (
                          <span className="badge false" title={`Terlalu banyak verifikasi wajah gagal. Terbuka otomatis dalam ${lockOf(c)} menit.`}>
                            <span className="msym xs">block</span>Wajah terkunci · {lockOf(c)} mnt
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {meSuper ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={bypassSet.has(c.nik)}
                          aria-label={`${bypassSet.has(c.nik) ? "Matikan" : "Aktifkan"} bypass verifikasi wajah ${c.full_name}`}
                          title={bypassSet.has(c.nik) ? "Bypass aktif — klik untuk mematikan" : "Klik untuk bypass verifikasi wajah (demo)"}
                          className={`switch${bypassSet.has(c.nik) ? " on" : ""}`}
                          onClick={() => {
                            setError("");
                            setBypassPw("");
                            setBypassing(c);
                          }}
                        >
                          <span className="knob" />
                        </button>
                      ) : (
                        <span className={`badge ${bypassSet.has(c.nik) ? "pending" : "off"}`}>{bypassSet.has(c.nik) ? "Aktif" : "Mati"}</span>
                      )}
                    </td>
                    <td>{formatDateTime(c.created_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {lockOf(c) > 0 && (
                        <button
                          className="icon-btn"
                          title="Buka kunci verifikasi wajah"
                          aria-label={`Buka kunci verifikasi wajah ${c.full_name}`}
                          onClick={() => {
                            setError("");
                            setUnlocking(c);
                          }}
                        >
                          <span className="msym sm">key</span>
                        </button>
                      )}
                      <button className="icon-btn" title="Edit profil" aria-label={`Edit profil ${c.full_name}`} onClick={() => openEdit(c)}>
                        <span className="msym sm">edit</span>
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Hapus"
                        aria-label={`Hapus ${c.full_name}`}
                        onClick={() => {
                          setError("");
                          setDeleting(c);
                        }}
                      >
                        <span className="msym sm">delete</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="NIK" />
      </div>

      {adding && (
        <Modal title="Tambah NIK" sub="Nama akan tampil otomatis di aplikasi saat warga memasukkan NIK ini." onClose={() => setAdding(false)}>
          <form onSubmit={add}>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="nik">NIK (16 digit)</label>
              <input
                id="nik"
                className="input"
                inputMode="numeric"
                maxLength={16}
                value={nik}
                onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="nm">Nama lengkap</label>
              <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>Batal</button>
              <button className="btn primary" disabled={busy || nik.length !== 16 || name.trim().length < 2}>
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && form && (
        <Modal
          title="Edit profil pengguna"
          sub={`NIK ${maskNik(editing.nik)} — foto otomatis dikompres agar hemat memori.`}
          size="lg"
          onClose={() => {
            setEditing(null);
            setForm(null);
          }}
        >
          <form onSubmit={saveProfile}>
            {error && <div className="alert error" role="alert">{error}</div>}

            <div className="photo-edit">
              <div className="photo-ring">
                {form.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.photo} alt="Pratinjau foto profil" />
                ) : (
                  <span className="ph">{initials(form.full_name)}</span>
                )}
                {photoBusy && <div className="photo-spin"><span className="msym spin">progress_activity</span></div>}
              </div>
              <div className="photo-ctl">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
                <button type="button" className="btn sm" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                  <span className="msym sm">photo_camera</span>{form.photo ? "Ganti foto" : "Unggah foto"}
                </button>
                {form.photo && (
                  <button type="button" className="btn sm ghost" disabled={photoBusy} onClick={() => setForm({ ...form, photo: null })}>
                    Hapus
                  </button>
                )}
                <small className="hint">Dikompres ke JPEG ≤256px di perangkat ini sebelum dikirim.</small>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="pf-name">Nama lengkap</label>
                <input id="pf-name" className="input" value={form.full_name} maxLength={100} required onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pf-birth">Tanggal lahir</label>
                <input id="pf-birth" type="date" className="input" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pf-phone">No. HP</label>
                <input id="pf-phone" className="input" inputMode="tel" placeholder="+62…" value={form.phone} maxLength={20} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pf-email">Email</label>
                <input id="pf-email" className="input" type="email" placeholder="nama@contoh.com" value={form.email} maxLength={120} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pf-addr">Alamat rumah</label>
              <textarea id="pf-addr" className="input" rows={3} maxLength={400} placeholder="Jalan, RT/RW, kelurahan, kota…" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <AddressPicker
                initialPin={pin}
                onPin={setPin}
                onAddress={(address) => setForm((f) => (f ? { ...f, address: address.slice(0, 400) } : f))}
              />
            </div>

            <div className="actions">
              <button type="button" className="btn" onClick={() => { setEditing(null); setForm(null); }}>Batal</button>
              <button className="btn primary" disabled={busy || photoBusy || form.full_name.trim().length < 2}>
                {busy ? "Menyimpan…" : "Simpan profil"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {bypassing && (
        <Modal
          title={bypassSet.has(bypassing.nik) ? "Matikan bypass verifikasi wajah?" : "Aktifkan bypass verifikasi wajah?"}
          sub={
            bypassSet.has(bypassing.nik)
              ? `${bypassing.full_name} (${maskNik(bypassing.nik)}) kembali wajib verifikasi wajah saat login.`
              : `${bypassing.full_name} (${maskNik(bypassing.nik)}) bisa masuk ke aplikasi hanya dengan NIK, tanpa verifikasi wajah. Pakai hanya untuk demo/penjurian dan matikan setelahnya.`
          }
          onClose={() => setBypassing(null)}
        >
          <form onSubmit={submitBypass} autoComplete="off">
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="bpw">Kata sandi Anda (konfirmasi)</label>
              <input
                id="bpw"
                type="password"
                className="input"
                value={bypassPw}
                onChange={(e) => setBypassPw(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setBypassing(null)}>Batal</button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Memproses…" : bypassSet.has(bypassing.nik) ? "Ya, matikan bypass" : "Ya, aktifkan bypass"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {unlocking && (
        <Modal
          title="Buka kunci verifikasi wajah?"
          sub={`${unlocking.full_name} (${maskNik(unlocking.nik)}) gagal verifikasi wajah 5 kali dalam 15 menit. Buka hanya jika Anda sudah memastikan ini memang pemilik NIK, misalnya lewat telepon.`}
          onClose={() => setUnlocking(null)}
        >
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions">
            <button className="btn" onClick={() => setUnlocking(null)}>Batal</button>
            <button className="btn ok" disabled={busy} onClick={unlock}>{busy ? "Membuka…" : "Ya, buka kunci"}</button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Hapus NIK?"
          sub={`${deleting.full_name} (${maskNik(deleting.nik)}) tidak akan bisa login lagi. Laporan lamanya tetap tersimpan.`}
          onClose={() => setDeleting(null)}
        >
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions">
            <button className="btn" onClick={() => setDeleting(null)}>Batal</button>
            <button className="btn danger" disabled={busy} onClick={remove}>{busy ? "Menghapus…" : "Ya, hapus"}</button>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.full_name} sub={maskNik(viewing.nik)} onClose={() => setViewing(null)}>
          <div className="profile-view">
            {viewing.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="big-photo" src={viewing.photo} alt={`Foto ${viewing.full_name}`} />
            ) : (
              <div className="big-photo ph">{initials(viewing.full_name)}</div>
            )}
            <dl>
              <dt>No. HP</dt><dd>{viewing.phone || "—"}</dd>
              <dt>Email</dt><dd>{viewing.email || "—"}</dd>
              <dt>Tanggal lahir</dt><dd>{viewing.birth_date ? formatBirth(viewing.birth_date) : "—"}</dd>
              <dt>Alamat</dt><dd>{viewing.address || "—"}</dd>
              <dt>Status</dt><dd>{viewing.active ? "Aktif" : "Nonaktif"}</dd>
            </dl>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setViewing(null)}>Tutup</button>
            <button className="btn primary" onClick={() => { const c = viewing; setViewing(null); openEdit(c); }}>
              <span className="msym sm">edit</span>Edit profil
            </button>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
