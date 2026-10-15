import "server-only";
import { db } from "./supabase";
import { reverseDetailed } from "./geo";
import { inScope } from "./supportArea";


export type ReportRegion = {
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  label: string;
};
type Row = { region: ReportRegion | null; address: string | null; failed?: boolean; at: string };

const PREFIX = "report_region:";
const keyFor = (id: string) => PREFIX + id;

const recent = new Map<string, { address: string; region: ReportRegion | null } | null>();
const spot = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export async function loadReportRegions(): Promise<Map<string, Row>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out = new Map<string, Row>();
  for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as Row);
  return out;
}

export async function loadRegionsFor(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("settings").select("key,value").in("key", ids.slice(i, i + 200).map(keyFor));
    for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as Row);
  }
  return out;
}

export async function reportsInScope(scope: Set<string> | null, ids: string[]): Promise<boolean> {
  if (scope === null) return true;
  const regions = await loadRegionsFor(ids);
  return ids.every((id) => inScope(scope, regions.get(id)?.region?.province));
}

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
