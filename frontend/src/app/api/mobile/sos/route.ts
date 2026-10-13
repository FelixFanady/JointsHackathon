import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, coords, cleanText, findCitizen, rateLimit, storePhoto } from "@/lib/mobile";

export const dynamic = "force-dynamic";

const SOS_CATEGORIES = ["Tsunami", "Gempa Bumi", "Banjir", "Kebakaran", "Longsor", "Pencurian", "Penjambretan", "Perampokan", "Bencana Lainnya", "Darurat"];

export async function POST(req: Request) {
  const rl = rateLimit(req, "sos", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const c = await findCitizen(b?.nik);
  if (!c) return bad("NIK tidak terdaftar.", 404);
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
  return NextResponse.json({ id: data.id });
}
