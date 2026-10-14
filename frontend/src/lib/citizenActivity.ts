import "server-only";
import { db } from "./supabase";
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

/** Record a login (app identify). Best-effort: never throws into the request. */
export async function recordLogin(nik: string): Promise<void> {
  try {
    const current = await loadActivity(nik);
    await db()
      .from("settings")
      .upsert(
        { key: keyFor(nik), value: { ...current, last_login: new Date().toISOString() }, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
  } catch {
    /* non-fatal — activity tracking must not block login */
  }
}

/** App pulled its notification inbox: proves the app is installed and receiving; also counts as activity. */
export async function recordNoticeFetch(nik: string): Promise<void> {
  try {
    const current = await loadActivity(nik);
    const now = new Date().toISOString();
    await db()
      .from("settings")
      .upsert(
        { key: keyFor(nik), value: { ...current, last_login: now, notices_fetched_at: now }, updated_at: now },
        { onConflict: "key" },
      );
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
    await db()
      .from("settings")
      .upsert(
        { key: keyFor(nik), value: { ...current, last_lat: lat, last_lng: lng, last_seen_at: now }, updated_at: now },
        { onConflict: "key" },
      );
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
    await db()
      .from("settings")
      .upsert({ key: keyFor(nik), value: { ...(await loadActivity(nik)), region_failed: { lat: a.last_lat, lng: a.last_lng } }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return false;
  }
  await db()
    .from("settings")
    .upsert({ key: keyFor(nik), value: { ...(await loadActivity(nik)), region }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return true;
}

export async function loadActivity(nik: string): Promise<CitizenActivity> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return (data?.value ?? {}) as CitizenActivity;
}

/** Load ALL citizen activity rows in one prefix query. Map nik -> activity. */
export async function loadAllActivity(): Promise<Record<string, CitizenActivity>> {
  const out: Record<string, CitizenActivity> = {};
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  for (const row of data ?? []) {
    if (typeof row.key === "string" && row.key.startsWith(PREFIX)) {
      out[row.key.slice(PREFIX.length)] = (row.value ?? {}) as CitizenActivity;
    }
  }
  return out;
}

/** Remove a citizen's activity row (used when the NIK is deleted). */
export async function deleteActivity(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
