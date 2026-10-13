"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Gagal masuk. Coba lagi.");
        return;
      }
      router.replace(j.role === "admin" ? "/admin" : "/support/reports");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="alert error" role="alert">
          <span className="msym sm">error</span>
          <span>{error}</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          placeholder="contoh: budi.santoso"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Kata Sandi</label>
        <div className="pw">
          <input
            id="password"
            className="input"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Masukkan kata sandi"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="icon-btn" aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} onClick={() => setShow(!show)}>
            <span className="msym sm">{show ? "visibility_off" : "visibility"}</span>
          </button>
        </div>
      </div>
      <label className="remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Ingat sesi saya di perangkat ini
      </label>
      <button className="btn primary block" disabled={busy || !username || !password}>
        {busy ? "Memeriksa…" : "Masuk"}
        {!busy && <span className="msym sm">arrow_forward</span>}
      </button>
    </form>
  );
}
