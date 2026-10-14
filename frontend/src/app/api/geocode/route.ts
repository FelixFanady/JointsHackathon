import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { reverseDetailed, searchPlace } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Street-map helper for the address picker (admin/support only; server-side so the
 * OpenStreetMap usage policy — User-Agent, 1 req/s — is respected).
 *   GET ?lat=&lng=  -> { address, region }   (what is at this map point)
 *   GET ?q=         -> { lat, lng, label }   (where is this place)
 */
export async function GET(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const u = new URL(req.url);

  const q = u.searchParams.get("q");
  if (q !== null) {
    const hit = await searchPlace(q);
    return hit ? NextResponse.json(hit) : NextResponse.json({ error: "Tempat tidak ditemukan." }, { status: 404 });
  }

  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Koordinat tidak valid." }, { status: 400 });
  }
  const r = await reverseDetailed(lat, lng);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Alamat di titik ini tidak ditemukan." }, { status: 404 });
}
