import "server-only";
import { db, fetchAll } from "./supabase";
import { open, seal, tryOpen } from "./crypto";
import type { Region } from "./geo";
import { reverseGeocode } from "./geo";


export type CitizenActivity = {
  last_login?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  last_seen_at?: string | null;
  notices_fetched_at?: string | null;
  region?: Region | null;
  region_failed?: { lat: number; lng: number } | null;
};

const PREFIX = "citizen_activity:";
const keyFor = (nik: string) => `${PREFIX}${nik}`;

async function put(nik: string, value: CitizenActivity, at = new Date().toISOString()): Promise<void> {
  await db().from("settings").upsert({ key: keyFor(nik), value: seal(value, keyFor(nik)), updated_at: at }, { onConflict: "key" });
}

export async function recordLogin(nik: string): Promise<void> {
  try {
    const current = await loadActivity(nik);
    await put(nik, { ...current, last_login: new Date().toISOString() });
  } catch {
  }
}



export async function recordNoticeFetch(nik: string, pos?: { lat: number; lng: number } | null): Promise<void> {
  try {
    const current = await loadActivity(nik);
    const now = new Date().toISOString();
    const loc = pos ? { last_lat: pos.lat, last_lng: pos.lng, last_seen_at: now } : {};
    await put(nik, { ...current, ...loc, last_login: now, notices_fetched_at: now }, now);
    if (pos) await resolveActivityRegion(nik);
  } catch {
  }
}

export async function recordLocation(nik: string, lat: number, lng: number): Promise<void> {
  try {
    const current = await loadActivity(nik);
    const now = new Date().toISOString();
    await put(nik, { ...current, last_lat: lat, last_lng: lng, last_seen_at: now }, now);
    await resolveActivityRegion(nik);
  } catch {
  }
}

export async function resolveActivityRegion(nik: string): Promise<boolean> {
  const a = await loadActivity(nik);
  if (a.last_lat == null || a.last_lng == null) return false;
  const r = a.region;
  if (r && Math.abs(r.lat - a.last_lat) < 0.01 && Math.abs(r.lng - a.last_lng) < 0.01) return false;
  const f = a.region_failed;
  if (f && Math.abs(f.lat - a.last_lat) < 0.01 && Math.abs(f.lng - a.last_lng) < 0.01) return false;
  const region = await reverseGeocode(a.last_lat, a.last_lng);
  if (!region) {
    await put(nik, { ...(await loadActivity(nik)), region_failed: { lat: a.last_lat, lng: a.last_lng } });
    return false;
  }
  await put(nik, { ...(await loadActivity(nik)), region });
  return true;
}

export async function loadActivity(nik: string): Promise<CitizenActivity> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return open<CitizenActivity>(data?.value, keyFor(nik));
}

export async function loadAllActivity(): Promise<Record<string, CitizenActivity>> {
  const out: Record<string, CitizenActivity> = {};
  const { data } = await fetchAll<{ key: string; value: unknown }>((a, b) =>
    db().from("settings").select("key,value").like("key", `${PREFIX}%`).order("key").range(a, b),
  );
  for (const row of data) {
    if (typeof row.key === "string" && row.key.startsWith(PREFIX)) {
      const a = tryOpen<CitizenActivity>(row.value, row.key);
      if (a) out[row.key.slice(PREFIX.length)] = a;
    }
  }
  return out;
}

export async function deleteActivity(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
