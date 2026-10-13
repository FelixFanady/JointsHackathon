import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, coords, cleanText, findCitizen, maskPii, rateLimit, storePhoto } from "@/lib/mobile";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "report", 6);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const c = await findCitizen(b?.nik);
  if (!c) return bad("NIK tidak terdaftar.", 404);
  const pos = coords(b);
  if (!pos) return bad("Lokasi tidak valid.");
  const category = cleanText(b?.category, 60);
  if (!category) return bad("Pilih jenis laporan.");
  const description = maskPii(cleanText(b?.description, 1000));
  if (description.length < 10) return bad("Jelaskan masalahnya minimal 10 karakter.");

  const photo = await storePhoto(b?.photo);
  if (photo === "invalid") return bad("Foto tidak valid (JPEG/PNG, maks 2,5 MB).");

  const danger = b?.danger === true ? "[Membahayakan warga] " : "";
  const { data, error } = await db()
    .from("reports")
    .insert({
      kind: "report",
      nik: c.nik,
      reporter_name: c.full_name,
      category,
      description: danger + description,
      photo_url: photo,
      lat: pos.lat,
      lng: pos.lng,
      address: cleanText(b?.address, 200) || null,
    })
    .select("id")
    .single();
  if (error) return bad("Gagal mengirim laporan. Coba lagi.", 500);
  return NextResponse.json({ id: data.id });
}
