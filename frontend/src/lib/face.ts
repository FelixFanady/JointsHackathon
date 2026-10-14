import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "./supabase";

/**
 * Face login for the mobile app.
 *
 * The phone sends ONE live selfie. The backend loads the citizen's reference photo
 * (encrypted profile, never sent to the phone), asks the internal computer-vision
 * service (computer_vision/face_service.py, 127.0.0.1 only) for a similarity score, and
 * answers with { match, confidence } -- never a photo, never the raw embedding.
 *
 * A successful match returns a short signed "face session" token. Endpoints that expose
 * personal data can require it (see requireFaceSession). Emergency endpoints (SOS, report)
 * must NEVER require it: a failed face check must not stop someone from calling for help.
 */

const CV_URL = (process.env.CV_SERVICE_URL ?? "http://127.0.0.1:8100").replace(/\/$/, "");

/** SFace cosine. OpenCV's equal-error cut-off is 0.363; 0.42 trades a few false rejects for fewer false accepts. */
export const MATCH_THRESHOLD = Math.min(0.7, Math.max(0.363, Number(process.env.FACE_MATCH_THRESHOLD) || 0.42));

/** Similarity -> 0..1 score for the UI. 0.5 at OpenCV's cut-off; ~0.7 at our default threshold; ~0.96 at 0.6. */
export function confidenceOf(similarity: number): number {
  const c = 1 / (1 + Math.exp(-14 * (similarity - 0.363)));
  return Math.round(c * 100) / 100;
}

// ---------------------------------------------------------------- CV service

export type CvEnroll = { ok: true; photo_jpeg_b64: string } | { ok: false; reason: string };
export type CvCompare = { ok: true; similarity: number } | { ok: false; reason: string };

/** null = service unreachable / misconfigured (caller answers 503). */
export async function cv<T>(path: "/v1/enroll" | "/v1/compare", body: Record<string, string>): Promise<T | null> {
  const key = process.env.CV_API_KEY;
  if (!key) {
    console.error("[face] CV_API_KEY is not set");
    return null;
  }
  try {
    const r = await fetch(`${CV_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cv-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.error(`[face] CV service ${path} -> HTTP ${r.status}`);
      return null;
    }
    return (await r.json()) as T;
  } catch (e) {
    console.error(`[face] CV service ${path} unreachable:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Human message for a CV reason code (shown in the app; contains no data about anyone). */
export function reasonMessage(reason: string): string {
  switch (reason) {
    case "no_face": return "Wajah tidak terdeteksi. Hadapkan wajah ke kamera.";
    case "multiple_faces": return "Terdeteksi lebih dari satu wajah. Pastikan hanya Anda di depan kamera.";
    case "face_too_small": return "Wajah terlalu jauh. Dekatkan wajah ke kamera.";
    case "face_cut_off": return "Wajah terpotong. Posisikan wajah di tengah lingkaran.";
    case "face_unclear": return "Wajah kurang jelas. Lepas masker/kacamata gelap dan coba lagi.";
    case "too_dark": return "Terlalu gelap. Cari tempat yang lebih terang.";
    case "too_bright": return "Terlalu terang. Hindari cahaya langsung dari belakang/depan.";
    case "blurry": return "Foto buram. Tahan ponsel tetap diam.";
    case "too_large":
    case "too_small":
    case "invalid_image": return "Foto tidak valid. Coba lagi.";
    default: return "Wajah tidak dapat diproses. Coba lagi.";
  }
}

/** Accepts raw base64 or a data: URI of a JPEG (what the camera produces). Returns bare base64 or null. */
export function parseSelfie(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const b64 = v.startsWith("data:image/jpeg;base64,") ? v.slice(23) : v;
  if (b64.length < 1000 || b64.length > 3_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const head = Buffer.from(b64.slice(0, 8), "base64");
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? b64 : null;
}

// ---------------------------------------------------------------- brute-force guard (durable)

/**
 * Failed matches per NIK, stored in `settings` so the limit holds across serverless
 * instances and restarts (the IP limiter in lib/mobile.ts does not). Only timestamps.
 */
const GUARD_PREFIX = "face_guard:";
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

async function failsOf(nik: string): Promise<number[]> {
  const { data } = await db().from("settings").select("value").eq("key", GUARD_PREFIX + nik).maybeSingle();
  const arr = (data?.value as { fails?: unknown } | null)?.fails;
  const now = Date.now();
  return Array.isArray(arr) ? arr.filter((t): t is number => typeof t === "number" && now - t < FAIL_WINDOW_MS) : [];
}

/** Minutes until the NIK may try again, or 0 when not locked. */
export async function lockedMinutes(nik: string): Promise<number> {
  const fails = await failsOf(nik);
  if (fails.length < MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((Math.min(...fails) + FAIL_WINDOW_MS - Date.now()) / 60_000));
}

export async function recordFail(nik: string): Promise<void> {
  const fails = [...(await failsOf(nik)), Date.now()].slice(-MAX_FAILS * 2);
  await db()
    .from("settings")
    .upsert({ key: GUARD_PREFIX + nik, value: { fails }, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .then(() => undefined, () => undefined);
}

export async function clearFails(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", GUARD_PREFIX + nik).then(() => undefined, () => undefined);
}

export const lockedResponse = (minutes: number) =>
  NextResponse.json(
    { error: `Terlalu banyak percobaan wajah gagal. Coba lagi dalam ${minutes} menit atau hubungi petugas.`, code: "face_locked" },
    { status: 429 },
  );

// ---------------------------------------------------------------- face session token

const TOKEN_TTL_S = 30 * 24 * 3600;

let tokenKeyCache: Buffer | null = null;
/** Separate key derived from DATA_ENCRYPTION_KEY (HKDF), so no new secret has to be configured. */
function tokenKey(): Buffer {
  if (tokenKeyCache) return tokenKeyCache;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  tokenKeyCache = Buffer.from(hkdfSync("sha256", Buffer.from(raw, "base64"), Buffer.alloc(0), "siagaku-face-session-v1", 32));
  return tokenKeyCache;
}

const sign = (nik: string, exp: number) => createHmac("sha256", tokenKey()).update(`fv1.${nik}.${exp}`).digest("base64url");

/** Token = "fv1.<exp>.<sig>"; the NIK is bound in the signature, not carried in the token. */
export function issueFaceToken(nik: string): { token: string; expires_at: string } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S;
  return { token: `fv1.${exp}.${sign(nik, exp)}`, expires_at: new Date(exp * 1000).toISOString() };
}

export function checkFaceToken(nik: string, token: unknown): boolean {
  if (typeof token !== "string") return false;
  const m = /^fv1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(nik, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * For endpoints that return a citizen's personal data. Enforced only when
 * FACE_AUTH_ENFORCE=1, so older app builds keep working until the new one is rolled out.
 * Never call this from SOS/report.
 */
export function requireFaceSession(req: Request, nik: string): NextResponse | null {
  if (process.env.FACE_AUTH_ENFORCE !== "1") return null;
  if (checkFaceToken(nik, req.headers.get("x-face-token"))) return null;
  return NextResponse.json({ error: "Verifikasi wajah diperlukan. Silakan masuk kembali.", code: "face_required" }, { status: 401 });
}
