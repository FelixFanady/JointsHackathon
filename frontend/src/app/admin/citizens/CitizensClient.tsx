"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatDateTime, maskNik } from "@/lib/util";
import type { Citizen } from "@/lib/types";

export default function CitizensClient({ initial }: { initial: Citizen[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Citizen | null>(null);
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n
      ? initial.filter(
          (c) => c.nik.startsWith(n) || c.full_name.toLowerCase().includes(n),
        )
      : initial;
  }, [initial, q]);

  async function call(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<string | null> {
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
    const err = await call("/api/admin/citizens", "POST", {
      nik,
      full_name: name,
    });
    setBusy(false);
    if (err) return setError(err);
    setAdding(false);
    setNik("");
    setName("");
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const err = await call(`/api/admin/citizens/${deleting.nik}`, "DELETE");
    setBusy(false);
    if (err) return setError(err);
    setDeleting(null);
    router.refresh();
  }

  async function toggle(c: Citizen) {
    const err = await call(`/api/admin/citizens/${c.nik}`, "PATCH", {
      active: !c.active,
    });
    if (err) alert(err);
    else router.refresh();
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="input search grow"
          placeholder="Cari NIK atau nama…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari pengguna"
        />
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
                  <th>NIK</th>
                  <th>Nama</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.nik}>
                    <td className="mono">{maskNik(c.nik)}</td>
                    <td>{c.full_name}</td>
                    <td>
                      <span className={`badge ${c.active ? "valid" : "off"}`}>
                        {c.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>{formatDateTime(c.created_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="icon-btn"
                        title={c.active ? "Nonaktifkan" : "Aktifkan"}
                        aria-label={c.active ? "Nonaktifkan" : "Aktifkan"}
                        onClick={() => toggle(c)}
                      >
                        <span className="msym sm">
                          {c.active ? "toggle_on" : "toggle_off"}
                        </span>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && (
        <Modal
          title="Tambah NIK"
          sub="Nama akan tampil otomatis di aplikasi saat warga memasukkan NIK ini."
          onClose={() => setAdding(false)}
        >
          <form onSubmit={add}>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
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
              <input
                id="nm"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => setAdding(false)}
              >
                Batal
              </button>
              <button
                className="btn primary"
                disabled={busy || nik.length !== 16 || name.trim().length < 2}
              >
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Hapus NIK?"
          sub={`${deleting.full_name} (${maskNik(deleting.nik)}) tidak akan bisa login lagi. Laporan lamanya tetap tersimpan.`}
          onClose={() => setDeleting(null)}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={() => setDeleting(null)}>
              Batal
            </button>
            <button className="btn danger" disabled={busy} onClick={remove}>
              {busy ? "Menghapus…" : "Ya, hapus"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
