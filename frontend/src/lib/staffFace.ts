import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";
import { open, seal } from "./crypto";
import type { Profile } from "./types";

export const STAFF_FACE_COOKIE = "sa_face";
export const STAFF_FACE_TTL_S = 12 * 3600;
const PREFIX = "staff_face:";

type StaffFace = { photo: string; enrolled_at: string };

function exemptUsers(): Set<string> {
  const raw = process.env.STAFF_FACE_EXEMPT ?? "admin@siagaku.gov";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function needsStaffFace(user: Pick<Profile, "username">): boolean {
  if (process.env.STAFF_FACE_REQUIRED === "0") return false;
  return !exemptUsers().has(user.username.toLowerCase());
}

export const staffLockId = (userId: string) => `staff:${userId}`;

let keyCache: Buffer | null = null;
function tokenKey(): Buffer {
  if (keyCache) return keyCache;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  keyCache = Buffer.from(hkdfSync("sha256", Buffer.from(raw, "base64"), Buffer.alloc(0), "siagaku-staff-face-v1", 32));
  return keyCache;
}

const sign = (userId: string, exp: number) => createHmac("sha256", tokenKey()).update(`sf1.${userId}.${exp}`).digest("base64url");

export function issueStaffFaceToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + STAFF_FACE_TTL_S;
  return `sf1.${exp}.${sign(userId, exp)}`;
}

export function checkStaffFaceToken(userId: string, token: string | undefined): boolean {
  if (!token) return false;
  const m = /^sf1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(userId, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function staffFaceVerified(user: Pick<Profile, "id" | "username">): Promise<boolean> {
  if (!needsStaffFace(user)) return true;
  try {
    return checkStaffFaceToken(user.id, (await cookies()).get(STAFF_FACE_COOKIE)?.value);
  } catch {
    return false;
  }
}

export async function loadStaffFace(userId: string): Promise<StaffFace | null> {
  const { data, error } = await db().from("settings").select("value").eq("key", PREFIX + userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.value) return null;
  const v = open<StaffFace>(data.value, PREFIX + userId);
  return v?.photo ? v : null;
}

export async function saveStaffFace(userId: string, photo: string): Promise<boolean> {
  const value = seal({ photo, enrolled_at: new Date().toISOString() } satisfies StaffFace, PREFIX + userId);
  const { error } = await db()
    .from("settings")
    .upsert({ key: PREFIX + userId, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return !error;
}

export async function deleteStaffFace(userId: string): Promise<boolean> {
  const { error } = await db().from("settings").delete().eq("key", PREFIX + userId);
  return !error;
}

export async function staffFaceIndex(): Promise<Record<string, string>> {
  const { data } = await db().from("settings").select("key,updated_at").like("key", `${PREFIX}%`).limit(5000);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[String(row.key).slice(PREFIX.length)] = String(row.updated_at ?? "");
  return out;
}

export function staffFaceCookie(token: string) {
  return {
    name: STAFF_FACE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_FACE_TTL_S,
  };
}
