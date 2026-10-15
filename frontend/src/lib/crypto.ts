import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";


type Envelope = { enc: "v1"; iv: string; tag: string; ct: string };

let cached: Buffer | null = null;
function key(): Buffer {
  if (cached) return cached;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set (base64 of 32 random bytes).");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  cached = buf;
  return buf;
}

export function isSealed(v: unknown): v is Envelope {
  return !!v && typeof v === "object" && (v as Envelope).enc === "v1" && typeof (v as Envelope).ct === "string";
}

export function seal(value: unknown, aad: string): Envelope {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(JSON.stringify(value ?? {}), "utf8"), c.final()]);
  return { enc: "v1", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

export function open<T>(stored: unknown, aad: string): T {
  if (!isSealed(stored)) return (stored ?? {}) as T;
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(stored.iv, "base64"));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(stored.tag, "base64"));
  const pt = Buffer.concat([d.update(Buffer.from(stored.ct, "base64")), d.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

export function tryOpen<T>(stored: unknown, aad: string): T | null {
  try {
    return open<T>(stored, aad);
  } catch (e) {
    console.error(`[crypto] cannot decrypt ${aad}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
