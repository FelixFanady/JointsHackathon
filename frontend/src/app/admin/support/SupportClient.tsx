"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatDateTime } from "@/lib/util";
import type { Profile } from "@/lib/types";

type Mode = { kind: "add" } | { kind: "password"; p: Profile } | { kind: "delete"; p: Profile } | null;

export default function SupportClient({ initial }: { initial: Profile[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState({ full_name: "", username: "", unit: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(m: Mode) {
    setForm({ full_name: "", username: "", unit: "", password: "" });
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

  async function toggle(p: Profile) {
    const res = await fetch(`/api/admin/support/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
    if (res.ok) router.refresh(); else alert("Gagal mengubah status.");
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
              <thead><tr><th>Petugas</th><th>Username</th><th>Unit</th><th>Status</th><th>Dibuat</th><th aria-label="Aksi" /></tr></thead>
              <tbody>
                {initial.map((p) => (
                  <tr key={p.id}>
                    <td><div className="person"><span className="av">{p.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>{p.full_name}</div></td>
                    <td className="mono">{p.username}</td>
                    <td>{p.unit ?? "-"}</td>
                    <td><span className={`badge ${p.active ? "valid" : "off"}`}>{p.active ? "Aktif" : "Nonaktif"}</span></td>
                    <td>{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="icon-btn" title={p.active ? "Nonaktifkan" : "Aktifkan"} aria-label={p.active ? "Nonaktifkan akun" : "Aktifkan akun"} onClick={() => toggle(p)}><span className="msym sm">{p.active ? "toggle_on" : "toggle_off"}</span></button>
                      <button className="icon-btn" title="Ganti kata sandi" aria-label="Ganti kata sandi" onClick={() => open({ kind: "password", p })}><span className="msym sm">key</span></button>
                      <button className="icon-btn danger" title="Hapus" aria-label={`Hapus ${p.full_name}`} onClick={() => open({ kind: "delete", p })}><span className="msym sm">delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {mode?.kind === "add" && (
        <Modal title="Buat akun support" sub="Bagikan username dan kata sandi ini ke petugas secara aman." onClose={() => setMode(null)}>
          <form onSubmit={(e) => { e.preventDefault(); call("/api/admin/support", "POST", form); }}>
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

      {mode?.kind === "delete" && (
        <Modal title="Hapus akun support?" sub={`${mode.p.full_name} (${mode.p.username}) tidak bisa login lagi. Riwayat verifikasinya akan kehilangan nama petugas.`} onClose={() => setMode(null)}>
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="actions"><button className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn danger" disabled={busy} onClick={() => call(`/api/admin/support/${mode.p.id}`, "DELETE")}>{busy ? "Menghapus…" : "Ya, hapus"}</button></div>
        </Modal>
      )}
    </>
  );
}
