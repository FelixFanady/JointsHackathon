import "server-only";
import { db } from "./supabase";
import { open, seal, tryOpen } from "./crypto";
import type { Region } from "./geo";
import { addressUsable, forwardGeocode, reverseDetailed } from "./geo";


export type CitizenProfile = {
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
  face?: { source: "admin" | "self"; enrolled_at: string } | null;
  birth_date?: string | null;
  address?: string | null;
  geo?: (Partial<Region> & { query: string; failed?: boolean }) | null;
};

const PREFIX = "citizen_profile:";
const keyFor = (nik: string) => `${PREFIX}${nik}`;

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

export async function loadProfile(nik: string): Promise<CitizenProfile> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  return open<CitizenProfile>(data?.value, keyFor(nik));
}

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

export async function savePinGeo(nik: string, pin: { lat: number; lng: number }, addressText: string): Promise<void> {
  const r = await reverseDetailed(pin.lat, pin.lng);
  const region = r?.region;
  await saveProfile(nik, {
    geo: region ? { ...region, lat: pin.lat, lng: pin.lng, query: addressText.trim() } : { query: addressText.trim(), failed: true },
  });
}

export async function deleteProfile(nik: string): Promise<void> {
  await db().from("settings").delete().eq("key", keyFor(nik));
}
