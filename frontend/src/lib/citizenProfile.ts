import "server-only";
import { db } from "./supabase";
import { open, seal, tryOpen } from "./crypto";
import type { Region } from "./geo";
import { addressUsable, forwardGeocode, reverseDetailed } from "./geo";

/**
 * Citizen profile fields (email, phone, photo, birth date, address) stored
 * WITHOUT altering the `citizens` table — the Supabase project is read-only to
 * us for DDL. We reuse the existing `settings` (key text, value jsonb) table,
 * one row per citizen keyed `citizen_profile:<nik>`. The app's own settings use
 * numeric keys only, so these JSON rows never collide with them.
 */

export type CitizenProfile = {
  email?: string | null;
  phone?: string | null;
  photo?: string | null; // compressed base64 data-URI
  birth_date?: string | null; // YYYY-MM-DD
  address?: string | null;
  /** Region resolved from `address` via OpenStreetMap; `failed` = looked up, nothing found (don't retry). */
  geo?: (Partial<Region> & { query: string; failed?: boolean }) | null;
};

const PREFIX = "citizen_profile:";
const keyFor = (nik: string) => `${PREFIX}${nik}`;

/** Load profiles for the given NIKs. Returns a map nik -> profile. */
export async function loadProfiles(niks: string[]): Promise<Record<string, CitizenProfile>> {
  const out: Record<string, CitizenProfile> = {};
  if (!niks.length) return out;
  const keys = niks.map(keyFor);
  const { data } = await db().from("settings").select("key,value").in("key", keys);
  for (const row of data ?? []) {
    if (typeof row.key === "string" && row.key.startsWith(PREFIX)) {
      const p = tryOpen<CitizenProfile>(row.value, row.key);
      if (p) out[row.key.slice(PREFIX.length)] = p;
    }
  }
  return out;
}

/**
 * Load ALL citizen profiles in one query via a key-prefix match. Unlike
 * loadProfiles it does not need the NIK list first, so the page can fetch it in
 * parallel with the citizens query. `like` on the primary key uses the index.
 */
export async function loadAllProfiles(): Promise<Record<string, CitizenProfile>> {
  const out: Record<string, CitizenProfile> = {};
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  for (const row of data ?? []) {
    if (typeof row.key === "string" && row.key.startsWith(PREFIX)) {
      const p = tryOpen<CitizenProfile>(row.value, row.key);
      if (p) out[row.key.slice(PREFIX.length)] = p;
    }
  }
  return out;
}

/** Load one citizen's profile (empty object if none saved yet). */
export async function loadProfile(nik: string): Promise<CitizenProfile> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return open<CitizenProfile>(data?.value, keyFor(nik)); // throws if encrypted and unreadable: never overwrite with {}
}

/** Merge a partial profile patch into the stored one. */
export async function saveProfile(nik: string, patch: CitizenProfile): Promise<string | null> {
  const current = await loadProfile(nik);
  const next: CitizenProfile = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    (next as Record<string, unknown>)[k] = v === "" ? null : v;
  }
  const { error } = await db()
    .from("settings")
    .upsert({ key: keyFor(nik), value: seal(next, keyFor(nik)), updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message : null;
}

/**
 * Resolve the street-map region of the saved address text (forward geocoding).
 * Skipped when already resolved for this exact text. Too-vague addresses (e.g. "bsd")
 * are marked `failed` instead of guessing a random place. Returns true if something changed.
 */
export async function resolveProfileGeo(nik: string): Promise<boolean> {
  const p = await loadProfile(nik);
  const text = (p.address ?? "").trim();
  if (!text) {
    if (!p.geo) return false;
    await saveProfile(nik, { geo: null });
    return true;
  }
  if (p.geo?.query === text) return false;
  const region = addressUsable(text) ? await forwardGeocode(text) : null;
  await saveProfile(nik, { geo: region ? { ...region, query: text } : { query: text, failed: true } });
  return true;
}

/**
 * The admin picked the address on the map: store the pin's region directly (no text
 * guessing). `query` is set to the saved address text so resolveProfileGeo treats it as done.
 */
export async function savePinGeo(nik: string, pin: { lat: number; lng: number }, addressText: string): Promise<void> {
  const r = await reverseDetailed(pin.lat, pin.lng);
  const region = r?.region;
  await saveProfile(nik, {
    geo: region ? { ...region, lat: pin.lat, lng: pin.lng, query: addressText.trim() } : { query: addressText.trim(), failed: true },
  });
}

/** Remove a citizen's profile row (used when the NIK is deleted). */
export async function deleteProfile(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
