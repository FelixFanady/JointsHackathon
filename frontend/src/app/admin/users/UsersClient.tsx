"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatDateTime } from "@/lib/util";
import type { Profile, Role } from "@/lib/types";
import Pager, { usePaged } from "@/components/Pager";

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

export default function UsersClient({
  initial,
  meId,
}: {
  initial: Profile[];
  meId: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<RoleTab>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
                      <span
                        className={`badge ${p.role === "admin" ? "report" : "valid"}`}
                      >
                        {p.role === "admin" ? "Admin" : "Support"}
                      </span>
                    </td>
                    <td>{p.unit ?? "-"}</td>
                    <td>
                      <span className={`badge ${p.active ? "valid" : "off"}`}>
                        {p.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {p.role === "support" && (
                        <Link
                          className="icon-btn"
                          href="/admin/support"
                          title="Kelola di Akun Support"
                          aria-label={`Kelola ${p.full_name} di Akun Support`}
                        >
                          <span className="msym sm">settings</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pager {...paged} label="akun" />
      </div>

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
