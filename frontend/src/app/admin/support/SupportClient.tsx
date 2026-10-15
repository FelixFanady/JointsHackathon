"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { alertDialog } from "@/components/Dialog";
import { formatDateTime } from "@/lib/util";
import { compressImage } from "@/lib/image";
import type { Profile } from "@/lib/types";
import { ALL_AREAS, PROVINCES, areaLabel } from "@/lib/provinces";
import Pager, { usePaged } from "@/components/Pager";

type Row = Profile & { areas: string[]; face_at: string | null; face_locked: number };

type Mode = { kind: "add" } | { kind: "password"; p: Row } | { kind: "delete"; p: Row } | { kind: "areas"; p: Row } | { kind: "face"; p: Row } | null;

function FaceThumb({ p, onClick }: { p: Row; onClick: () => void }) {
  return (
    <button type="button" className="face-thumb" onClick={onClick} title={p.face_at ? "Lihat / ganti foto wajah" : "Unggah foto wajah"} aria-label={`Foto wajah ${p.full_name}`}>
      {p.face_at ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/admin/staff/${p.id}/face?v=${encodeURIComponent(p.face_at)}`} alt="" loading="lazy" />
      ) : (
        <span className="msym sm">photo_camera</span>
      )}
    </button>
  );
}

function FacePanel({ p, onDone }: { p: Row; onDone: (msg: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = p.face_at ? `/api/admin/staff/${p.id}/face?v=${encodeURIComponent(p.face_at)}` : null;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      setPreview(await compressImage(file, { maxEdge: 960, quality: 0.9 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses foto.");
    }
  }

  async function upload() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/staff/${p.id}/face`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo: preview }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return onDone(`Foto wajah ${p.full_name} disimpan.`);
    setError((j.error ?? "Gagal menyimpan foto.") + (j.detail ? ` [${j.detail}]` : ""));
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/staff/${p.id}/face-reset`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return onDone(`Wajah ${p.full_name} dihapus. Ia akan diminta mendaftar ulang saat login.`);
    setError(j.error ?? "Gagal menghapus wajah.");
  }

  const shown = preview ?? current;
  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="face-panel">
        <div className={`face-preview${shown ? "" : " empty"}`}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={preview ? "Pratinjau foto baru" : `Foto wajah ${p.full_name}`} />
          ) : (
            <span className="msym">person</span>
          )}
          {busy && <div className="photo-spin"><span className="msym spin">progress_activity</span></div>}
        </div>
        <div className="face-meta">
          {preview ? (
            <span className="badge pending">Foto baru, belum disimpan</span>
          ) : p.face_at ? (
            <span className="badge valid">Terdaftar {formatDateTime(p.face_at)}</span>
          ) : (
            <span className="badge off">Belum terdaftar</span>
          )}
          {p.face_locked > 0 && <span className="badge false">Terkunci · {p.face_locked} mnt</span>}
          <p className="hint">
            Foto ini dipakai untuk verifikasi wajah petugas saat login. Wajib satu wajah, terang, tidak buram, menghadap kamera. Mengganti foto juga membuka kunci percobaan.
          </p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      <div className="actions">
        {p.face_at && !preview && (
          <button type="button" className="btn danger" disabled={busy} onClick={remove} style={{ marginRight: "auto" }}>
            <span className="msym sm">delete</span>Hapus wajah
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          <span className="msym sm">photo_camera</span>{preview ? "Pilih foto lain" : p.face_at ? "Ganti foto" : "Unggah foto"}
        </button>
        {preview && (
          <button type="button" className="btn primary" disabled={busy} onClick={upload}>
            {busy ? "Memeriksa wajah…" : "Simpan foto"}
          </button>
        )}
      </div>
    </>
  );
}

function AreaPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const all = value.includes(ALL_AREAS);
  const shown = PROVINCES.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value.filter((x) => x !== ALL_AREAS), p]);
  return (
    <div className="area-picker">
      <label className="area-all">
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? [ALL_AREAS] : [])} />
        <span><b>ALL — Seluruh dunia</b><small>Semua laporan, termasuk di luar Indonesia dan yang daerahnya belum diketahui.</small></span>
      </label>
      <div className="area-tools">
        <input className="input" placeholder="Cari provinsi…" value={q} onChange={(e) => setQ(e.target.value)} disabled={all} aria-label="Cari provinsi" />
        <button type="button" className="btn sm" disabled={all} onClick={() => onChange([...PROVINCES])}>Pilih 38</button>
        <button type="button" className="btn sm" disabled={all} onClick={() => onChange([])}>Kosongkan</button>
      </div>
      <div className="area-list" role="group" aria-label="Provinsi">
        {shown.map((p) => (
          <label key={p} className={all ? "dim" : ""}>
            <input type="checkbox" disabled={all} checked={all || value.includes(p)} onChange={() => toggle(p)} />
            {p}
          </label>
        ))}
      </div>
      <span className="hint">
        {all ? "Melihat semua wilayah." : value.length ? `${value.length} provinsi dipilih.` : "Belum ada wilayah: petugas tidak akan melihat laporan apa pun."}
      </span>
    </div>
  );
}

export default function SupportClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState({ full_name: "", username: "", unit: "", password: "" });
  const [areas, setAreas] = useState<string[]>([ALL_AREAS]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const paged = usePaged(initial);

  function open(m: Mode) {
    setForm({ full_name: "", username: "", unit: "", password: "" });
    setAreas(m?.kind === "areas" ? m.p.areas : [ALL_AREAS]);
    setError("");
    setMode(m);
  }

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (res.ok) { setMode(null); router.refresh(); return true; }
    setError((await res.json().catch(() => ({}))).error ?? "Permintaan gagal.");
    return false;
  }

  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const isActive = (p: Profile) => flags[p.id] ?? p.active;

  async function toggle(p: Profile) {
    if (pending.has(p.id)) return;
    const next = !isActive(p);
    setFlags((f) => ({ ...f, [p.id]: next }));
    setPending((s) => new Set(s).add(p.id));
    const res = await fetch(`/api/admin/support/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: next }) });
    setPending((s) => { const n = new Set(s); n.delete(p.id); return n; });
    if (res.ok) { router.refresh(); return; }
    setFlags((f) => ({ ...f, [p.id]: !next }));
    await alertDialog({ title: "Gagal mengubah status", message: (await res.json().catch(() => ({}))).error ?? "Coba lagi sebentar lagi.", tone: "danger", icon: "error" });
  }

  const genPw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const buf = crypto.getRandomValues(new Uint32Array(14));
    setForm((f) => ({ ...f, password: Array.from(buf, (n) => chars[n % chars.length]).join("") }));
  };

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button className="btn primary" onClick={() => open({ kind: "add" })}><span className="msym sm">person_add</span>Buat akun support</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {initial.length === 0 ? (
            <div className="empty"><span className="msym">support_agent</span>Belum ada akun support.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Petugas</th><th>Wajah</th><th>Username</th><th>Unit</th><th>Wilayah tugas</th><th>Status</th><th>Dibuat</th><th aria-label="Aksi" /></tr></thead>
              <tbody>
                {paged.slice.map((p) => {
                  const on = isActive(p);
                  return (
                  <tr key={p.id} className={on ? "" : "row-off"}>
                    <td><div className="person"><span className="av">{p.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>{p.full_name}</div></td>
                    <td>
                      <div className="face-cell">
                        <FaceThumb p={p} onClick={() => open({ kind: "face", p })} />
                        {p.face_locked > 0 ? (
                          <span className="badge false">Terkunci</span>
                        ) : (
                          <span className={`badge ${p.face_at ? "valid" : "off"}`}>{p.face_at ? "Terdaftar" : "Belum"}</span>
                        )}
                      </div>
                    </td>
                    <td className="mono">{p.username}</td>
                    <td>{p.unit ?? "-"}</td>
                    <td>
                      <button className="linklike" onClick={() => open({ kind: "areas", p })} title={p.areas.join(", ") || "Belum ditugaskan"}>
                        <span className={`badge ${p.areas.includes(ALL_AREAS) ? "report" : p.areas.length ? "valid" : "off"}`}>{areaLabel(p.areas)}</span>
                      </button>
                    </td>
                    <td>
                      <div className="status-cell">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${on ? "Nonaktifkan" : "Aktifkan"} ${p.full_name}`}
                          title={on ? "Klik untuk menonaktifkan" : "Klik untuk mengaktifkan"}
                          className={`switch${on ? " on" : ""}${pending.has(p.id) ? " busy" : ""}`}
                          onClick={() => toggle(p)}
                        >
                          <span className="knob" />
                        </button>
                        <span className={`state-pill ${on ? "on" : "off"}`}><i aria-hidden />{on ? "Aktif" : "Nonaktif"}</span>
                      </div>
                    </td>
                    <td>{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="icon-btn" title="Foto wajah" aria-label={`Foto wajah ${p.full_name}`} onClick={() => open({ kind: "face", p })}><span className="msym sm">photo_camera</span></button>
                      <button className="icon-btn" title="Atur wilayah tugas" aria-label={`Atur wilayah tugas ${p.full_name}`} onClick={() => open({ kind: "areas", p })}><span className="msym sm">map</span></button>
                      <button className="icon-btn" title="Ganti kata sandi" aria-label="Ganti kata sandi" onClick={() => open({ kind: "password", p })}><span className="msym sm">key</span></button>
                      <button className="icon-btn danger" title="Hapus" aria-label={`Hapus ${p.full_name}`} onClick={() => open({ kind: "delete", p })}><span className="msym sm">delete</span></button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="akun" />
      </div>

      {mode?.kind === "add" && (
        <Modal title="Buat akun support" sub="Bagikan username dan kata sandi ini ke petugas secara aman." onClose={() => setMode(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call("/api/admin/support", "POST", { ...form, areas }); }}>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field"><label htmlFor="fn">Nama lengkap</label><input id="fn" className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoFocus /></div>
            <div className="field"><label htmlFor="un">Username</label><input id="un" className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} autoCapitalize="none" required /><span className="hint">3-32 karakter: a-z, 0-9, titik, strip, garis bawah.</span></div>
            <div className="field"><label htmlFor="ut">Unit / satuan tugas</label><input id="ut" className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Contoh: Call Center 112" /></div>
            <div className="field">
              <label htmlFor="pw">Kata sandi sementara</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="pw" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} maxLength={72} required />
                <button type="button" className="btn" onClick={genPw}>Acak</button>
              </div>
              <span className="hint">Minimal 8 karakter.</span>
            </div>
            <div className="field"><label>Wilayah tugas</label><AreaPicker value={areas} onChange={setAreas} /></div>
            <div className="actions"><button type="button" className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Membuat…" : "Buat akun"}</button></div>
          </form>
        </Modal>
      )}

      {mode?.kind === "password" && (
        <Modal title="Ganti kata sandi" sub={`Akun: ${mode.p.username}`} onClose={() => setMode(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(`/api/admin/support/${mode.p.id}`, "PATCH", { password: form.password }); }}>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="np">Kata sandi baru</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="np" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} maxLength={72} required autoFocus />
                <button type="button" className="btn" onClick={genPw}>Acak</button>
              </div>
            </div>
            <div className="actions"><button type="button" className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
          </form>
        </Modal>
      )}

      {mode?.kind === "areas" && (
        <Modal title="Wilayah tugas" sub={`${mode.p.full_name} hanya melihat laporan, peta, dan warga di wilayah ini.`} onClose={() => setMode(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call(`/api/admin/support/${mode.p.id}`, "PATCH", { areas }); }}>
            {error && <div className="alert error" role="alert">{error}</div>}
            <AreaPicker value={areas} onChange={setAreas} />
            <div className="actions"><button type="button" className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
          </form>
        </Modal>
      )}

      {mode?.kind === "face" && (
        <Modal title="Foto wajah petugas" sub={`${mode.p.full_name} (${mode.p.username})`} onClose={() => setMode(null)}>
          <FacePanel
            p={mode.p}
            onDone={(msg) => {
              setMode(null);
              router.refresh();
              void alertDialog({ title: "Berhasil", message: msg, icon: "check_circle" });
            }}
          />
        </Modal>
      )}

      {mode?.kind === "delete" && (
        <Modal title="Hapus akun support?" sub={`${mode.p.full_name} (${mode.p.username}) tidak bisa login lagi. Riwayat verifikasinya akan kehilangan nama petugas.`} onClose={() => setMode(null)}>
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions"><button className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn danger" disabled={busy} onClick={() => call(`/api/admin/support/${mode.p.id}`, "DELETE")}>{busy ? "Menghapus…" : "Ya, hapus"}</button></div>
        </Modal>
      )}
    </>
  );
}
