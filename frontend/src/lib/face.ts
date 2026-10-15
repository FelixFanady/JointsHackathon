import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "./supabase";


const CV_URL = (process.env.CV_SERVICE_URL || "https://api-siagaku.felixfanady.com").replace(/\/$/, "");

function cvUrlAllowed(): boolean {
  try {
    const u = new URL(CV_URL);
    if (u.protocol === "https:") return true;
    if (u.protocol !== "http:") return false;
    return ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || process.env.CV_ALLOW_INSECURE_HTTP === "1";
  } catch {
    return false;
  }
}

export const MATCH_THRESHOLD = Math.min(0.7, Math.max(0.363, Number(process.env.FACE_MATCH_THRESHOLD) || 0.42));

export function confidenceOf(similarity: number): number {
  const c = 1 / (1 + Math.exp(-14 * (similarity - 0.363)));
  return Math.round(c * 100) / 100;
}


export type CvEnroll = { ok: true; photo_jpeg_b64: string } | { ok: false; reason: string };
export type CvCompare = { ok: true; similarity: number } | { ok: false; reason: string };

let lastCvError = "";

function describeHttpFailure(r: Response): string {
  const viaCloudflare = (r.headers.get("server") ?? "").toLowerCase() === "cloudflare";
  const html = (r.headers.get("content-type") ?? "").includes("text/html");
  if (viaCloudflare && r.status === 403 && html) return "cloudflare_blocked_403";
  if (viaCloudflare && r.status >= 520 && r.status <= 530) return `cloudflare_origin_${r.status}`;
  if (r.status === 401) return "cv_key_mismatch_401";
  return `cv_http_${r.status}`;
}

const UA = "SiagaKu-Server/1.0";

export async function cv<T>(path: "/v1/enroll" | "/v1/compare", body: Record<string, string>): Promise<T | null> {
  const key = process.env.CV_API_KEY;
  if (!key) {
    lastCvError = "cv_api_key_missing";
    console.error("[face] CV_API_KEY is not set");
    return null;
  }
  if (!cvUrlAllowed()) {
    lastCvError = "cv_url_insecure";
    console.error("[face] CV_SERVICE_URL must be https:// (or http on localhost). Refusing to send faces over plain HTTP.");
    return null;
  }
  try {
    const r = await fetch(`${CV_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cv-key": key, "User-Agent": UA },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      lastCvError = describeHttpFailure(r);
      console.error(`[face] CV service ${CV_URL}${path} -> HTTP ${r.status} (${lastCvError}, cf-ray ${r.headers.get("cf-ray") ?? "-"})`);
      return null;
    }
    lastCvError = "";
    return (await r.json()) as T;
  } catch (e) {
    lastCvError = "cv_unreachable";
    console.error(`[face] CV service ${CV_URL}${path} unreachable:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export function cvUnavailable(): NextResponse {
  const body: Record<string, string> = {
    error: "Layanan verifikasi wajah sedang tidak tersedia. Coba lagi nanti.",
    code: "cv_unavailable",
  };
  if (process.env.NODE_ENV !== "production" && lastCvError) body.detail = lastCvError;
  return NextResponse.json(body, { status: 503 });
}

export type CvKeyState = "ok" | "missing" | "mismatch" | "unknown";
export type CvHealth = { ok: boolean; host: string; http: number; detail: string; ms: number; key: CvKeyState };

async function probeKey(): Promise<CvKeyState> {
  const key = process.env.CV_API_KEY;
  if (!key) return "missing";
  try {
    const r = await fetch(`${CV_URL}/v1/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cv-key": key, "User-Agent": UA },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (r.status === 401) return "mismatch";
    return r.status === 422 ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function cvHealth(): Promise<CvHealth> {
  let host = "";
  try {
    host = new URL(CV_URL).host;
  } catch {
    return { ok: false, host: "", http: 0, detail: "cv_url_invalid", ms: 0, key: "unknown" };
  }
  if (!cvUrlAllowed()) return { ok: false, host, http: 0, detail: "cv_url_insecure", ms: 0, key: "unknown" };
  const t0 = Date.now();
  try {
    const r = await fetch(`${CV_URL}/health`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, host, http: r.status, detail: describeHttpFailure(r), ms, key: "unknown" };
    const j = (await r.json().catch(() => null)) as { ok?: unknown } | null;
    if (j?.ok !== true) return { ok: false, host, http: r.status, detail: "unexpected_body", ms, key: "unknown" };
    const key = await probeKey();
    if (key === "missing") return { ok: false, host, http: r.status, detail: "cv_api_key_missing", ms, key };
    if (key === "mismatch") return { ok: false, host, http: r.status, detail: "cv_key_mismatch_401", ms, key };
    return { ok: true, host, http: r.status, detail: "ok", ms, key };
  } catch {
    return { ok: false, host, http: 0, detail: "cv_unreachable", ms: Date.now() - t0, key: "unknown" };
  }
}

export function lastCvFailure(): string {
  return lastCvError || "cv_unavailable";
}

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

export function parseSelfie(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const b64 = v.startsWith("data:image/jpeg;base64,") ? v.slice(23) : v;
  if (b64.length < 1000 || b64.length > 3_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const head = Buffer.from(b64.slice(0, 8), "base64");
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? b64 : null;
}


const GUARD_PREFIX = "face_guard:";
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

function recentFails(value: unknown): number[] {
  const arr = (value as { fails?: unknown } | null)?.fails;
  const now = Date.now();
  return Array.isArray(arr) ? arr.filter((t): t is number => typeof t === "number" && now - t < FAIL_WINDOW_MS) : [];
}

function minutesLeft(fails: number[]): number {
  if (fails.length < MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((Math.min(...fails) + FAIL_WINDOW_MS - Date.now()) / 60_000));
}

async function failsOf(nik: string): Promise<number[]> {
  const { data } = await db().from("settings").select("value").eq("key", GUARD_PREFIX + nik).maybeSingle();
  return recentFails(data?.value);
}

export async function lockedMinutes(nik: string): Promise<number> {
  return minutesLeft(await failsOf(nik));
}

export async function lockedNiks(): Promise<Record<string, number>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${GUARD_PREFIX}%`).limit(5000);
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const nik = String(row.key).slice(GUARD_PREFIX.length);
    const m = minutesLeft(recentFails(row.value));
    if (m) out[nik] = m;
  }
  return out;
}

export async function unlockFace(nik: string): Promise<boolean> {
  const { error } = await db().from("settings").delete().eq("key", GUARD_PREFIX + nik);
  return !error;
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


const TOKEN_TTL_S = 30 * 24 * 3600;

let tokenKeyCache: Buffer | null = null;
function tokenKey(): Buffer {
  if (tokenKeyCache) return tokenKeyCache;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  tokenKeyCache = Buffer.from(hkdfSync("sha256", Buffer.from(raw, "base64"), Buffer.alloc(0), "siagaku-face-session-v1", 32));
  return tokenKeyCache;
}

const sign = (nik: string, exp: number) => createHmac("sha256", tokenKey()).update(`fv1.${nik}.${exp}`).digest("base64url");

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

export function requireFaceSession(req: Request, nik: string): NextResponse | null {
  if (process.env.FACE_AUTH_ENFORCE !== "1") return null;
  if (checkFaceToken(nik, req.headers.get("x-face-token"))) return null;
  return NextResponse.json({ error: "Verifikasi wajah diperlukan. Silakan masuk kembali.", code: "face_required" }, { status: 401 });
}
