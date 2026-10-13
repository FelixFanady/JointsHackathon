import "server-only";
import { db } from "./supabase";

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
      out[row.key.slice(PREFIX.length)] = (row.value ?? {}) as CitizenProfile;
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
      out[row.key.slice(PREFIX.length)] = (row.value ?? {}) as CitizenProfile;
    }
  }
  return out;
}

/** Load one citizen's profile (empty object if none saved yet). */
export async function loadProfile(nik: string): Promise<CitizenProfile> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return (data?.value ?? {}) as CitizenProfile;
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
    .upsert({ key: keyFor(nik), value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message : null;
}

/** Remove a citizen's profile row (used when the NIK is deleted). */
export async function deleteProfile(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
