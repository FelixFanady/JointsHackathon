import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for sensitive JSON stored in the `settings` table
 * (citizen profile: email, phone, photo, birth date, address; activity: GPS, login times).
 *
 * AES-256-GCM, random 96-bit IV per write. The row key is bound in as AAD, so a ciphertext
 * copied onto another row (another NIK) fails authentication instead of decrypting.
 *
 * Stored value (jsonb): { "enc": "v1", "iv": b64, "tag": b64, "ct": b64 }
 * Rows that are still plaintext (written before encryption existed) are read as-is and get
 * encrypted the next time they are written, or all at once with `npm run encrypt-data`.
 *
 * Key: DATA_ENCRYPTION_KEY = base64 of 32 random bytes, in .env.local only. If the key is lost
 * the encrypted rows cannot be recovered -- back it up somewhere other than this repo.
 */

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

/** Encrypt a JSON value. `aad` should be the row key. */
export function seal(value: unknown, aad: string): Envelope {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(JSON.stringify(value ?? {}), "utf8"), c.final()]);
  return { enc: "v1", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

/**
 * Decrypt a stored value. Plaintext (legacy) objects are returned unchanged.
 * THROWS if the value is encrypted but cannot be authenticated (wrong key / tampered / moved row),
 * so a read-modify-write never overwrites real data with an empty object.
 */
export function open<T>(stored: unknown, aad: string): T {
  if (!isSealed(stored)) return (stored ?? {}) as T;
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(stored.iv, "base64"));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(stored.tag, "base64"));
  const pt = Buffer.concat([d.update(Buffer.from(stored.ct, "base64")), d.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/** Like open() but returns null instead of throwing -- for list views, where one bad row must not hide the rest. */
export function tryOpen<T>(stored: unknown, aad: string): T | null {
  try {
    return open<T>(stored, aad);
  } catch (e) {
    console.error(`[crypto] cannot decrypt ${aad}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
