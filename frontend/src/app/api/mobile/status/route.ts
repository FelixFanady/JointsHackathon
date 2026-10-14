import { NextResponse } from "next/server";
import { coords, rateLimit, requireCitizen } from "@/lib/mobile";
import { loadStatuses } from "@/lib/areaStatus";
import { SCOPE_ALL, isActive, scopeLabel } from "@/lib/areaStatusMeta";
import { normalizeProvince } from "@/lib/provinces";
import { reverseGeocode } from "@/lib/geo";

export const dynamic = "force-dynamic";

// Province per ~5 km grid cell, so the app's polling does not hit the street map every time.
const cache = new Map<string, { province: string | null; at: number }>();
const TTL = 6 * 3600_000;

async function provinceAt(lat: number, lng: number): Promise<string | null> {
  const k = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.province;
  const r = await reverseGeocode(lat, lng).catch(() => null);
  const province = normalizeProvince(r?.province);
  if (r) {
    cache.set(k, { province, at: Date.now() });
    if (cache.size > 3000) cache.delete(cache.keys().next().value as string);
  }
  return province;
}

/**
 * Status Wilayah for the citizen app. Body: { nik, lat?, lng? }
 * -> { province, statuses: [...] } — active statuses for the whole country plus the province the phone is in.
 * Without a location only the country-wide statuses are returned.
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, "area-status", 40);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;

  const pos = b?.lat != null && b?.lng != null ? coords(b) : null;
  const province = pos ? await provinceAt(pos.lat, pos.lng) : null;
  const now = Date.now();
  const order = { awas: 0, siaga: 1, waspada: 2 } as const;
  const statuses = (await loadStatuses())
    .filter((s) => isActive(s, now) && (s.scope === SCOPE_ALL || s.scope === province))
    .sort((a, b2) => order[a.level] - order[b2.level] || Date.parse(b2.created_at) - Date.parse(a.created_at))
    .map((s) => ({
      id: s.id, title: s.title, level: s.level, hazard: s.hazard, hazard_label: s.hazard_label,
      scope: s.scope, scope_label: scopeLabel(s.scope), message: s.message, created_at: s.created_at, ends_at: s.ends_at,
    }));
  return NextResponse.json({ province, statuses });
}
