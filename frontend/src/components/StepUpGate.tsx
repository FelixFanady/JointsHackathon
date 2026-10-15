"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "./Logo";

const STEP_UP_CODE = "face_step_up_required";

function guarded(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/staff/face/");
  } catch {
    return false;
  }
}

export default function StepUpGate({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const ask = useCallback(
    () => new Promise<boolean>((resolve) => {
      waiters.current.push(resolve);
      setOpen(true);
    }),
    [],
  );

  const finish = useCallback((ok: boolean) => {
    const list = waiters.current;
    waiters.current = [];
    setOpen(false);
    list.forEach((fn) => fn(ok));
  }, []);

  useEffect(() => {
    const original = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!guarded(url)) return original(input, init);
      const req = new Request(input, init);
      const retry = req.clone();
      const res = await original(req);
      if (res.status !== 403) return res;
      const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
      if (body?.code !== STEP_UP_CODE) return res;
      if (!(await ask())) return res;
      return original(retry);
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
      finish(false);
    };
  }, [ask, finish]);

  return open ? <StepUpDialog name={name} onDone={finish} /> : null;
}

type Phase = "starting" | "live" | "sending" | "done" | "off";
type Result = { tone: "ok" | "err" | "warn"; text: string; confidence?: number } | null;

function StepUpDialog({ name, onDone }: { name: string; onDone: (ok: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<Result>(null);
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
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
      setPhase("off");
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setResult({
        tone: "err",
        text: denied
          ? "Akses kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu coba lagi."
          : "Kamera tidak bisa dibuka. Pastikan webcam terpasang dan tidak dipakai aplikasi lain.",
      });
    }
  }, []);

  const cancel = useCallback(() => {
    stop();
    onDone(false);
  }, [stop, onDone]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && phase !== "sending" && phase !== "done") cancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, phase]);

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
      const res = await fetch("/api/staff/face/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo, purpose: "step_up" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.match) {
        stop();
        setPhase("done");
        setResult({ tone: "ok", text: "Wajah cocok. Melanjutkan tindakan…", confidence: j.confidence });
        window.setTimeout(() => onDone(true), 400);
        return;
      }
      if (res.ok) {
        setResult({ tone: "err", text: "Wajah tidak cocok dengan akun ini. Coba lagi dengan wajah menghadap kamera dan cahaya cukup.", confidence: j.confidence });
      } else {
        setResult({ tone: res.status === 422 ? "warn" : "err", text: (j.error ?? "Verifikasi gagal. Coba lagi.") + (j.detail ? ` [${j.detail}]` : "") });
        if (res.status === 429 || res.status === 409) {
          stop();
          setShot(null);
          setPhase("off");
          return;
        }
      }
    } catch {
      setResult({ tone: "err", text: "Tidak dapat terhubung ke server. Periksa koneksi Anda." });
    }
    setShot(null);
    setPhase("live");
  }

  const camOn = phase === "live" || phase === "sending" || phase === "done";
  const busy = phase === "sending" || phase === "done";

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="stepup-title" onClick={(e) => { if (e.target === e.currentTarget && !busy) cancel(); }}>
      <div className="modal stepup">
        <div className="vf-head">
          <Logo />
          <div>
            <strong id="stepup-title">Verifikasi wajah ulang</strong>
            <small>{name} · Tindakan admin penting</small>
          </div>
        </div>
        <p className="vf-lead">
          Tindakan ini mengubah akun, akses, atau pengaturan sistem, jadi wajah Anda dicocokkan sekali lagi. Setelah cocok, tindakan admin lain tidak perlu verifikasi lagi selama 5 menit.
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
              <span>{phase === "starting" ? "Membuka kamera…" : "Kamera belum aktif"}</span>
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

        <div className="vf-actions">
          {phase === "off" ? (
            <button className="btn primary block" onClick={start}><span className="msym sm">photo_camera</span>Nyalakan kamera</button>
          ) : (
            <button className="btn primary block" onClick={submit} disabled={phase !== "live"}>
              {phase === "starting" && <><span className="spin" aria-hidden />Membuka kamera…</>}
              {phase === "sending" && <><span className="spin" aria-hidden />Mencocokkan…</>}
              {phase === "done" && <><span className="spin" aria-hidden />Melanjutkan…</>}
              {phase === "live" && "Verifikasi sekarang"}
            </button>
          )}
          <button className="btn ghost block" onClick={cancel} disabled={busy}>Batal</button>
        </div>
      </div>
    </div>
  );
}
