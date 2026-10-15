"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "checking" | "redirecting">("idle");
  const lock = useRef(false);
  const busy = phase !== "idle";

  useEffect(() => {
    if (phase !== "redirecting") return;
    const t = window.setTimeout(() => window.location.reload(), 20_000);
    return () => window.clearTimeout(t);
  }, [phase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || !username || !password) return;
    lock.current = true;
    setPhase("checking");
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Gagal masuk. Coba lagi.");
        setPassword("");
        setPhase("idle");
        lock.current = false;
        return;
      }
      setPhase("redirecting");
      router.replace(j.role === "admin" ? "/admin" : "/support/reports");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
      setPhase("idle");
      lock.current = false;
    }
  }

  const capsCheck = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCaps(e.getModifierState("CapsLock"));

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      {error && (
        <div className="alert error" role="alert">
          <span className="msym sm">error</span>
          <span>{error}</span>
        </div>
      )}
      <fieldset className="login-fields" disabled={busy}>
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          placeholder="Input Your Username"
          value={username}
          onChange={(e) => setUsername(e.target.value.trimStart())}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Kata sandi</label>
        <div className="pw">
          <input
            id="password"
            className="input"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Input Your Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={capsCheck}
            onKeyDown={capsCheck}
            onBlur={() => setCaps(false)}
            aria-describedby={caps ? "caps-hint" : undefined}
            required
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={
              show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
            }
            aria-pressed={show}
            onClick={() => setShow(!show)}
          >
            <span className="msym sm">
              {show ? "visibility_off" : "visibility"}
            </span>
          </button>
        </div>
        {caps && (
          <span id="caps-hint" className="caps" role="status">
            <span className="msym xs">warning</span>Caps Lock aktif
          </span>
        )}
      </div>
      <button
        className="btn primary block"
        disabled={busy || !username || !password}
      >
        {busy ? (
          <>
            <span className="spin" aria-hidden />
            {phase === "redirecting" ? "Membuka konsol…" : "Memeriksa…"}
          </>
        ) : (
          "Masuk"
        )}
      </button>
      </fieldset>
    </form>
  );
}
