import "server-only";
import { db } from "./supabase";
import { reverseDetailed } from "./geo";
import { inScope } from "./supportArea";

/**
 * Street address + area (kelurahan / kecamatan / kota) for each report, so the console can show
 * an address instead of raw coordinates and group reports by area. Stored WITHOUT altering the
 * `reports` table: one `settings` row per report keyed `report_region:<report id>` (same pattern
 * as citizen activity). A report sent without an address also gets `reports.address` filled in.
 */

export type ReportRegion = {
  province: string | null;
  city: string | null; // Kota / Kabupaten
  district: string | null; // Kecamatan
  village: string | null; // Kelurahan / Desa
  label: string; // "Kecamatan, Kota/Kab"
};
type Row = { region: ReportRegion | null; address: string | null; failed?: boolean; at: string };

const PREFIX = "report_region:";
const keyFor = (id: string) => PREFIX + id;

// Reports sent from the same spot (an SOS wave) reuse one lookup instead of hitting the street map again.
const recent = new Map<string, { address: string; region: ReportRegion | null } | null>();
const spot = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`; // ~11 m

/** All stored report regions, by report id. */
export async function loadReportRegions(): Promise<Map<string, Row>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out = new Map<string, Row>();
  for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as Row);
  return out;
}

/** Stored regions for specific reports (smaller than loading them all). */
export async function loadRegionsFor(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("settings").select("key,value").in("key", ids.slice(i, i + 200).map(keyFor));
    for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as Row);
  }
  return out;
}

/** True when EVERY report id is inside the caller's assigned provinces (scope null = everything). */
export async function reportsInScope(scope: Set<string> | null, ids: string[]): Promise<boolean> {
  if (scope === null) return true;
  const regions = await loadRegionsFor(ids);
  return ids.every((id) => inScope(scope, regions.get(id)?.region?.province));
}

/** Look up and store the address/area of one report. Returns true when something was resolved. Never throws. */
export async function resolveReportRegion(r: { id: string; lat: number; lng: number; address: string | null }): Promise<boolean> {
  try {
    const k = spot(r.lat, r.lng);
    let hit = recent.get(k);
    if (hit === undefined) {
      hit = await reverseDetailed(r.lat, r.lng);
      if (recent.size > 500) recent.clear();
      recent.set(k, hit);
    }
    const at = new Date().toISOString();
    if (!hit) {
      // Remember the miss so one bad point (open sea, service down) does not block the queue forever.
      await db().from("settings").upsert({ key: keyFor(r.id), value: { region: null, address: null, failed: true, at }, updated_at: at }, { onConflict: "key" });
      return false;
    }
    const region: ReportRegion | null = hit.region
      ? { province: hit.region.province, city: hit.region.city, district: hit.region.district, village: hit.region.village, label: hit.region.label }
      : null;
    await db().from("settings").upsert({ key: keyFor(r.id), value: { region, address: hit.address, at }, updated_at: at }, { onConflict: "key" });
    if (!r.address?.trim() && hit.address) await db().from("reports").update({ address: hit.address.slice(0, 200) }).eq("id", r.id);
    return true;
  } catch {
    return false;
  }
}
