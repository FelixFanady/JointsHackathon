/**
 * The 38 provinces of Indonesia, used to assign Support officers to areas.
 * "ALL" = the whole world (every report, including ones outside Indonesia or with an unknown area).
 * Client-safe (no server imports).
 */

export const ALL_AREAS = "ALL";

export const PROVINCES = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan",
  "Kepulauan Bangka Belitung", "Bengkulu", "Lampung", "DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah",
  "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
  "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara",
  "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara", "Maluku",
  "Maluku Utara", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Tengah", "Papua Pegunungan", "Papua Selatan",
] as const;

export type Province = (typeof PROVINCES)[number];

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/^provinsi\s+/, "")
    .replace(/daerah khusus ibu ?kota|daerah khusus/g, "dki")
    .replace(/daerah istimewa/g, "di")
    .replace(/sumatra/g, "sumatera")
    .replace(/nanggroe\s+aceh\s+darussalam/g, "aceh")
    .replace(/^bangka belitung$/, "kepulauan bangka belitung")
    .replace(/[^a-z]/g, "");

const BY_KEY = new Map<string, Province>(PROVINCES.map((p) => [squash(p), p]));

/** Street-map province name (e.g. "Daerah Khusus Ibukota Jakarta") -> one of the 38, or null (outside Indonesia / unknown). */
export function normalizeProvince(name: string | null | undefined): Province | null {
  if (!name) return null;
  return BY_KEY.get(squash(name)) ?? null;
}

/** Display text for an officer's assignment. */
export function areaLabel(areas: string[]): string {
  if (!areas.length) return "Belum ditugaskan";
  if (areas.includes(ALL_AREAS)) return "Seluruh dunia (ALL)";
  return areas.length <= 2 ? areas.join(", ") : `${areas.slice(0, 2).join(", ")} +${areas.length - 2}`;
}

export type MapHome = { lat: number; lng: number; zoom: number; label: string };

/** Whole of Indonesia (for "ALL" and admins). */
export const INDONESIA_VIEW: MapHome = { lat: -2.5, lng: 118, zoom: 5, label: "Indonesia" };

// Approximate centre + zoom that frames each province on the support map.
const VIEWS: Record<Province, [number, number, number]> = {
  "Aceh": [4.36, 96.75, 8], "Sumatera Utara": [2.19, 99.38, 7], "Sumatera Barat": [-0.74, 100.4, 8], "Riau": [0.51, 101.81, 8],
  "Kepulauan Riau": [1.9, 105.5, 7], "Jambi": [-1.61, 103.0, 8], "Sumatera Selatan": [-3.32, 104.0, 8],
  "Kepulauan Bangka Belitung": [-2.74, 106.9, 8], "Bengkulu": [-3.79, 102.26, 8], "Lampung": [-4.9, 105.3, 8],
  "DKI Jakarta": [-6.2, 106.84, 11], "Jawa Barat": [-6.9, 107.6, 9], "Banten": [-6.4, 106.06, 9], "Jawa Tengah": [-7.15, 110.14, 8],
  "DI Yogyakarta": [-7.88, 110.43, 10], "Jawa Timur": [-7.54, 112.24, 8], "Bali": [-8.4, 115.19, 10],
  "Nusa Tenggara Barat": [-8.65, 117.36, 8], "Nusa Tenggara Timur": [-9.2, 122.0, 7], "Kalimantan Barat": [-0.28, 111.48, 7],
  "Kalimantan Tengah": [-1.68, 113.38, 7], "Kalimantan Selatan": [-3.09, 115.28, 8], "Kalimantan Timur": [0.54, 116.42, 7],
  "Kalimantan Utara": [3.07, 116.04, 8], "Sulawesi Utara": [1.2, 124.8, 8], "Gorontalo": [0.7, 122.45, 9],
  "Sulawesi Tengah": [-1.43, 121.45, 7], "Sulawesi Barat": [-2.84, 119.23, 8], "Sulawesi Selatan": [-3.67, 119.97, 7],
  "Sulawesi Tenggara": [-4.14, 122.17, 8], "Maluku": [-3.24, 129.5, 7], "Maluku Utara": [1.57, 127.81, 7],
  "Papua": [-2.6, 139.6, 8], "Papua Barat": [-1.34, 133.17, 8], "Papua Barat Daya": [-1.0, 131.3, 8],
  "Papua Tengah": [-3.6, 136.6, 8], "Papua Pegunungan": [-4.1, 139.1, 8], "Papua Selatan": [-7.3, 139.6, 7],
};

/**
 * Where the support map opens for an officer: one province -> that province; several -> one of them at
 * random; "ALL" (or nothing usable) -> the whole of Indonesia.
 */
export function homeForAreas(areas: string[], pick: () => number = Math.random): MapHome {
  if (areas.includes(ALL_AREAS)) return INDONESIA_VIEW;
  const own = areas.filter((a): a is Province => a in VIEWS);
  if (!own.length) return INDONESIA_VIEW;
  const p = own[Math.floor(pick() * own.length) % own.length];
  const [lat, lng, zoom] = VIEWS[p];
  return { lat, lng, zoom, label: p };
}
