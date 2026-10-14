import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, coords, cleanText, rateLimit, requireCitizen, storePhoto } from "@/lib/mobile";
import { recordLogin, recordLocation } from "@/lib/citizenActivity";

export const dynamic = "force-dynamic";

const SOS_CATEGORIES = ["Tsunami", "Gempa Bumi", "Banjir", "Kebakaran", "Longsor", "Pencurian", "Penjambretan", "Perampokan", "Bencana Lainnya", "Darurat"];

export async function POST(req: Request) {
  const rl = rateLimit(req, "sos", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const c = f.citizen;
  const pos = coords(b);
  if (!pos) return bad("Lokasi tidak valid.");
  const category = SOS_CATEGORIES.includes(b?.category) ? b.category : "Darurat";

  // One person = one SOS per 10 minutes, so a single user cannot inflate the "15 people" counter.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dup } = await db().from("reports").select("id").eq("kind", "sos").eq("nik", c.nik).gte("created_at", since).limit(1);
  if (dup?.length) return NextResponse.json({ id: dup[0].id, duplicate: true });

  const photo = await storePhoto(b?.photo);
  if (photo === "invalid") return bad("Foto tidak valid (JPEG/PNG, maks 2,5 MB).");

  const { data, error } = await db()
    .from("reports")
    .insert({
      kind: "sos",
      nik: c.nik,
      reporter_name: c.full_name,
      category,
      photo_url: photo,
      lat: pos.lat,
      lng: pos.lng,
      address: cleanText(b?.address, 200) || null,
    })
    .select("id")
    .single();
  if (error) return bad("Gagal mengirim SOS. Coba lagi.", 500);
  // Mark the citizen active and remember where they fired from, so Support can
  // notify by recency and show each user's area. Best-effort, never blocks.
  void recordLogin(c.nik);
  void recordLocation(c.nik, pos.lat, pos.lng);
  return NextResponse.json({ id: data.id });
}
