import "server-only";


export type Region = {
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  label: string;
  lat: number;
  lng: number;
  source: "gps" | "address";
  at: string;
  query?: string;
};

const BASE = "https://nominatim.openstreetmap.org";
const UA = "SiagaKu/1.0 (emergency-reporting hackathon project)";

let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCall + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

type Addr = Record<string, string | undefined>;

function parse(a: Addr, lat: number, lng: number, source: Region["source"], query?: string): Region | null {
  const dki = !a.state && /^Daerah Khusus/i.test(a.city ?? "");
  const province = dki ? (a.city as string) : (a.state ?? a.region ?? null);
  const city = dki ? (a.district ?? a.municipality ?? a.city_district ?? province) : (a.city ?? a.county ?? a.town ?? a.regency ?? null);
  const district = dki
    ? (a.suburb ?? a.subdistrict ?? a.village ?? null)
    : (a.district ?? a.municipality ?? a.city_district ?? a.subdistrict ?? null);
  const village = a.village ?? a.suburb ?? a.neighbourhood ?? null;
  if (!city && !district && !province) return null;
  const label = [district, city].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") || (province as string);
  return { province, city, district, village, label, lat, lng, source, at: new Date().toISOString(), ...(query ? { query } : {}) };
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export function reverseGeocode(lat: number, lng: number): Promise<Region | null> {
  return throttled(async () => {
    const j = (await getJson(`${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=id&lat=${lat}&lon=${lng}`)) as
      | { address?: Addr; error?: string }
      | null;
    if (!j || j.error || !j.address) return null;
    return parse(j.address, lat, lng, "gps");
  });
}

export function addressUsable(text: string): boolean {
  const t = text.trim();
  return t.length >= 8 || t.split(/\s+/).length >= 2 && t.length >= 5;
}

export function forwardGeocode(text: string): Promise<Region | null> {
  const q = text.trim();
  if (!addressUsable(q)) return Promise.resolve(null);
  return throttled(async () => {
    const j = (await getJson(`${BASE}/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=id&accept-language=id&q=${encodeURIComponent(q)}`)) as
      | { lat: string; lon: string; address?: Addr }[]
      | null;
    const hit = j?.[0];
    if (!hit?.address) return null;
    return parse(hit.address, Number(hit.lat), Number(hit.lon), "address", q);
  });
}

export function reverseDetailed(lat: number, lng: number): Promise<{ address: string; region: Region | null } | null> {
  return throttled(async () => {
    const j = (await getJson(`${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=id&lat=${lat}&lon=${lng}`)) as
      | { display_name?: string; address?: Addr; error?: string }
      | null;
    if (!j || j.error || !j.display_name) return null;
    const address = j.display_name.replace(/,\s*Indonesia$/i, "").slice(0, 400);
    return { address, region: j.address ? parse(j.address, lat, lng, "address", address) : null };
  });
}

export function searchPlace(text: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = text.trim().slice(0, 120);
  if (q.length < 3) return Promise.resolve(null);
  return throttled(async () => {
    const j = (await getJson(`${BASE}/search?format=jsonv2&limit=1&countrycodes=id&accept-language=id&q=${encodeURIComponent(q)}`)) as
      | { lat: string; lon: string; display_name?: string }[]
      | null;
    const hit = j?.[0];
    if (!hit) return null;
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: (hit.display_name ?? q).replace(/,\s*Indonesia$/i, "") };
  });
}
