"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  name: string;
  role: string;
  mode: "enroll" | "verify";
  broken: boolean;
  lockedMinutes: number;
  next: string;
};

type Phase = "idle" | "starting" | "live" | "sending" | "done";
type Result = { tone: "ok" | "err" | "warn"; text: string; confidence?: number } | null;

export default function VerifyFaceClient({ name, role, mode, broken, lockedMinutes, next }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result>(
    lockedMinutes ? { tone: "err", text: `Terlalu banyak percobaan gagal. Coba lagi dalam ${lockedMinutes} menit atau minta admin membuka kunci.` } : null,
  );
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => window.location.assign(next), 20_000);
    return () => window.clearTimeout(t);
  }, [phase, next]);

  async function start() {
    setResult(null);
    setShot(null);
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
      }
      setPhase("live");
    } catch (e) {
      setPhase("idle");
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setResult({
        tone: "err",
        text: denied
          ? "Akses kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu coba lagi."
          : "Kamera tidak bisa dibuka. Pastikan webcam terpasang dan tidak dipakai aplikasi lain.",
      });
    }
  }

  function capture(): string | null {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const scale = Math.min(1, 960 / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  }

  async function submit() {
    if (phase !== "live") return;
    const photo = capture();
    if (!photo) return;
    setShot(photo);
    setPhase("sending");
    setResult(null);
    try {
      const res = await fetch(mode === "enroll" ? "/api/staff/face/enroll" : "/api/staff/face/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.match) {
        stop();
        setPhase("done");
        setResult({ tone: "ok", text: mode === "enroll" ? "Wajah terdaftar. Membuka konsol…" : "Wajah cocok. Membuka konsol…", confidence: j.confidence });
        router.replace(next);
        router.refresh();
        return;
      }
      if (res.ok) {
        setResult({ tone: "err", text: "Wajah tidak cocok dengan data akun ini. Coba lagi dengan wajah menghadap kamera dan cahaya cukup.", confidence: j.confidence });
      } else if (res.status === 409 && j.code === "already_registered") {
        window.location.reload();
        return;
      } else {
        setResult({ tone: res.status === 422 ? "warn" : "err", text: (j.error ?? "Verifikasi gagal. Coba lagi.") + (j.detail ? ` [${j.detail}]` : "") });
      }
    } catch {
      setResult({ tone: "err", text: "Tidak dapat terhubung ke server. Periksa koneksi Anda." });
    }
    setShot(null);
    setPhase("live");
  }

  async function logout() {
    stop();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }

  const camOn = phase === "live" || phase === "sending" || phase === "done";
  const blocked = broken || lockedMinutes > 0;

  return (
    <div className="vf">
      <div className="vf-card">
        <div className="vf-head">
          <div className="logo"><span className="msym">shield</span></div>
          <div>
            <strong>{mode === "enroll" ? "Daftarkan wajah Anda" : "Verifikasi wajah"}</strong>
            <small>{name} · {role === "admin" ? "Administrator" : "Petugas Support"}</small>
          </div>
        </div>

        <p className="vf-lead">
          {mode === "enroll"
            ? "Sekali saja: wajah ini dipakai untuk memastikan hanya Anda yang bertugas dengan akun ini. Setelah terdaftar, hanya admin yang bisa menggantinya."
            : "Wajib setiap sesi sebelum bertugas, agar tindakan di konsol benar-benar dilakukan oleh pemilik akun."}
        </p>

        <div className={`vf-stage${camOn ? " on" : ""}`}>
          <video ref={videoRef} playsInline muted aria-label="Pratinjau kamera" />
          {shot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot} alt="" aria-hidden />
          )}
          {camOn && <div className={`vf-oval${phase === "done" ? " ok" : ""}`} aria-hidden />}
          {!camOn && (
            <div className="vf-placeholder">
              <span className="msym">photo_camera</span>
              <span>Kamera belum aktif</span>
            </div>
          )}
        </div>

        {result && (
          <div className={`vf-result ${result.tone}`} role={result.tone === "ok" ? "status" : "alert"}>
            <span className="msym sm">{result.tone === "ok" ? "check_circle" : result.tone === "warn" ? "warning" : "error"}</span>
            <span>
              {result.text}
              {typeof result.confidence === "number" && <small>Confidence {Math.round(result.confidence * 100)}%</small>}
            </span>
          </div>
        )}

        {broken && <div className="vf-result err" role="alert"><span className="msym sm">error</span><span>Data wajah tidak dapat dibuka. Hubungi admin.</span></div>}

        <div className="vf-actions">
          {!camOn ? (
            <button className="btn primary block" onClick={start} disabled={blocked || phase === "starting"}>
              {phase === "starting" ? <><span className="spin" aria-hidden />Membuka kamera…</> : <><span className="msym sm">photo_camera</span>Nyalakan kamera</>}
            </button>
          ) : (
            <button className="btn primary block" onClick={submit} disabled={phase !== "live"}>
              {phase === "sending" && <><span className="spin" aria-hidden />{mode === "enroll" ? "Mendaftarkan…" : "Mencocokkan…"}</>}
              {phase === "done" && <><span className="spin" aria-hidden />Membuka konsol…</>}
              {phase === "live" && (mode === "enroll" ? "Ambil foto & daftarkan" : "Verifikasi sekarang")}
            </button>
          )}
          <button className="btn ghost block" onClick={logout} disabled={phase === "sending" || phase === "done"}>Keluar</button>
        </div>

        <ul className="vf-tips">
          <li>Wajah di tengah oval, menghadap lurus ke kamera.</li>
          <li>Cahaya cukup dari depan, tanpa masker atau kacamata gelap.</li>
          <li>Hanya Anda yang terlihat di kamera.</li>
        </ul>
      </div>
    </div>
  );
}
