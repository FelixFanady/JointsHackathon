"use client";

import { useRef, useState } from "react";
import { formatDateTime } from "@/lib/util";
import { compressImage } from "@/lib/image";
import { ALL_AREAS, PROVINCES } from "@/lib/provinces";

export type FaceSubject = { id: string; full_name: string; face_at: string | null; face_locked: number };

export function FacePanel({ p, onDone }: { p: FaceSubject; onDone: (msg: string) => void }) {
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

export function AreaPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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
