import "server-only";
import { db } from "./supabase";
import { open, seal, tryOpen } from "./crypto";
import type { Region } from "./geo";
import { reverseGeocode } from "./geo";

/**
 * Citizen activity (last login + last known location) stored WITHOUT altering
 * the `citizens` table — same approach as citizenProfile.ts: reuse the existing
 * `settings` (key text, value jsonb) table, one row per citizen keyed
 * `citizen_activity:<nik>`. The app's own settings use numeric keys only, so
 * these JSON rows never collide with them.
 */

export type CitizenActivity = {
  last_login?: string | null; // ISO timestamp of the last app identify/login
  last_lat?: number | null; // last reported SOS/report latitude
  last_lng?: number | null;
  last_seen_at?: string | null; // ISO timestamp the coords were recorded
  notices_fetched_at?: string | null; // last time the app pulled its notification inbox
  region?: Region | null; // district/city of the last GPS point (OpenStreetMap)
  region_failed?: { lat: number; lng: number } | null; // GPS point the street map could not resolve
};

const PREFIX = "citizen_activity:";
const keyFor = (nik: string) => `${PREFIX}${nik}`;

/** Encrypt + write one citizen's activity row. */
async function put(nik: string, value: CitizenActivity, at = new Date().toISOString()): Promise<void> {
  await db().from("settings").upsert({ key: keyFor(nik), value: seal(value, keyFor(nik)), updated_at: at }, { onConflict: "key" });
}

/** Record a login (app identify). Best-effort: never throws into the request. */
export async function recordLogin(nik: string): Promise<void> {
  try {
    const current = await loadActivity(nik);
    await put(nik, { ...current, last_login: new Date().toISOString() });
  } catch {
    /* non-fatal — activity tracking must not block login */
  }
}



/** App pulled its notification inbox: proves the app is installed and receiving; also counts as activity.
 *  `pos` (optional) is the phone's current GPS point, so "notify citizens nearby" reaches people who never reported. */
export async function recordNoticeFetch(nik: string, pos?: { lat: number; lng: number } | null): Promise<void> {
  try {
    const current = await loadActivity(nik);
    const now = new Date().toISOString();
    const loc = pos ? { last_lat: pos.lat, last_lng: pos.lng, last_seen_at: now } : {};
    await put(nik, { ...current, ...loc, last_login: now, notices_fetched_at: now }, now);
    // Street-map lookup only re-runs when the user moved > ~1 km (checked inside).
    if (pos) await resolveActivityRegion(nik);
  } catch {
    /* non-fatal */
  }
}

/** Record a last-known location (from an SOS / report) and resolve its district/city
 *  from the street map (reverse geocoding). Best-effort. */
export async function recordLocation(nik: string, lat: number, lng: number): Promise<void> {
  try {
    const current = await loadActivity(nik);
    const now = new Date().toISOString();
    await put(nik, { ...current, last_lat: lat, last_lng: lng, last_seen_at: now }, now);
    await resolveActivityRegion(nik);
  } catch {
    /* non-fatal */
  }
}

/** Resolve the region of the stored GPS point if missing or the user moved > ~1 km since it was resolved. */
export async function resolveActivityRegion(nik: string): Promise<boolean> {
  const a = await loadActivity(nik);
  if (a.last_lat == null || a.last_lng == null) return false;
  const r = a.region;
  if (r && Math.abs(r.lat - a.last_lat) < 0.01 && Math.abs(r.lng - a.last_lng) < 0.01) return false;
  const f = a.region_failed;
  if (f && Math.abs(f.lat - a.last_lat) < 0.01 && Math.abs(f.lng - a.last_lng) < 0.01) return false;
  const region = await reverseGeocode(a.last_lat, a.last_lng);
  if (!region) {
    // Remember the miss so one bad point (e.g. open sea, service error) doesn't block the queue forever.
    await put(nik, { ...(await loadActivity(nik)), region_failed: { lat: a.last_lat, lng: a.last_lng } });
    return false;
  }
  await put(nik, { ...(await loadActivity(nik)), region });
  return true;
}

export async function loadActivity(nik: string): Promise<CitizenActivity> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return open<CitizenActivity>(data?.value, keyFor(nik)); // throws if encrypted and unreadable: never overwrite with {}
}

/** Load ALL citizen activity rows in one prefix query. Map nik -> activity. */
export async function loadAllActivity(): Promise<Record<string, CitizenActivity>> {
  const out: Record<string, CitizenActivity> = {};
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  for (const row of data ?? []) {
    if (typeof row.key === "string" && row.key.startsWith(PREFIX)) {
      const a = tryOpen<CitizenActivity>(row.value, row.key);
      if (a) out[row.key.slice(PREFIX.length)] = a;
    }
  }
  return out;
}

/** Remove a citizen's activity row (used when the NIK is deleted). */
export async function deleteActivity(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
