import "server-only";
import { NextResponse } from "next/server";
import { db } from "./supabase";

export const NIK_RE = /^[0-9]{16}$/;

// Best-effort in-memory limiter (per server instance). Enough to slow NIK guessing; not a hard guarantee on serverless.
const hits = new Map<string, number[]>();
export function rateLimit(req: Request, bucket: string, max: number, windowMs = 60_000): NextResponse | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const k = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." }, { status: 429 });
  }
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(key);
  return null;
}

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function findCitizen(nik: unknown) {
  if (typeof nik !== "string" || !NIK_RE.test(nik)) return null;
  const { data } = await db().from("citizens").select("nik,full_name,active").eq("nik", nik).maybeSingle();
  return data && data.active ? data : null;
}

export function coords(b: any): { lat: number; lng: number } | null {
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";

/** Mask phone numbers / emails in free text before it is stored (matches the privacy note in the app). */
export function maskPii(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email disamarkan]")
    .replace(/(\+?62|0)[\s-]?8\d[\d\s-]{7,12}/g, "[nomor disamarkan]");
}

const BUCKET = "report-photos";
let bucketReady = false;

/** Accepts a base64 JPEG/PNG (<= ~2.5MB decoded), stores it, returns its public URL. */
export async function storePhoto(b64: unknown): Promise<string | null | "invalid"> {
  if (b64 == null || b64 === "") return null;
  if (typeof b64 !== "string" || b64.length > 3_400_000) return "invalid";
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 100 || buf.length > 2_500_000) return "invalid";
  let ext: "jpg" | "png";
  let type: string;
  if (buf[0] === 0xff && buf[1] === 0xd8) { ext = "jpg"; type = "image/jpeg"; }
  else if (buf[0] === 0x89 && buf[1] === 0x50) { ext = "png"; type = "image/png"; }
  else return "invalid";

  const s = db().storage;
  if (!bucketReady) {
    const { error } = await s.createBucket(BUCKET, { public: true, fileSizeLimit: 3_000_000, allowedMimeTypes: ["image/jpeg", "image/png"] });
    if (error && !/exist/i.test(error.message)) return "invalid";
    bucketReady = true;
  }
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await s.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (error) return "invalid";
  return s.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
