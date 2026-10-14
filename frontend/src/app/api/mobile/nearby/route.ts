import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, coords, rateLimit } from "@/lib/mobile";

export const dynamic = "force-dynamic";

/** Public-safe nearby feed: no names, no NIK, coordinates rounded to ~100 m. False reports are hidden. */
export async function GET(req: Request) {
  const rl = rateLimit(req, "nearby", 30);
  if (rl) return rl;
  const u = new URL(req.url);
  const pos = coords({ lat: u.searchParams.get("lat"), lng: u.searchParams.get("lng") });
  if (!pos) return bad("Lokasi tidak valid.");
  const radiusKm = Math.min(Math.max(Number(u.searchParams.get("radius_km")) || 5, 1), 25);

  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(Math.cos((pos.lat * Math.PI) / 180), 0.2));
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data, error } = await db()
    .from("reports")
    .select("id,kind,category,description,address,status,lat,lng,created_at,reviewed_by")
    .neq("status", "false")
    .gte("created_at", since)
    .gte("lat", pos.lat - dLat).lte("lat", pos.lat + dLat)
    .gte("lng", pos.lng - dLng).lte("lng", pos.lng + dLng)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return bad("Gagal memuat data.", 500);

  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const items = (data ?? [])
    .map((r) => {
      const a = Math.sin(rad(r.lat - pos.lat) / 2) ** 2 + Math.cos(rad(pos.lat)) * Math.cos(rad(r.lat)) * Math.sin(rad(r.lng - pos.lng) / 2) ** 2;
      const km = 2 * R * Math.asin(Math.sqrt(a));
      return {
        id: r.id,
        kind: r.kind,
        category: r.category,
        title: r.category,
        address: r.address,
        status: r.status,
        verified_by: r.status === "valid" ? (r.reviewed_by ? "petugas" : "otomatis") : null,
        lat: Math.round(r.lat * 1000) / 1000,
        lng: Math.round(r.lng * 1000) / 1000,
        created_at: r.created_at,
        distance_km: Math.round(km * 100) / 100,
      };
    })
    .filter((r) => r.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
  return NextResponse.json({ items });
}
