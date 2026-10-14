import { NextResponse, after } from "next/server";
import { db } from "@/lib/supabase";
import { bad, coords, cleanText, maskPii, rateLimit, requireCitizen, storePhoto } from "@/lib/mobile";
import { recordLogin, recordLocation } from "@/lib/citizenActivity";
import { enqueue, kickQueue } from "@/lib/aiQueue";
import { resolveReportRegion } from "@/lib/reportRegion";
import { reportCode } from "@/lib/util";
import { instantCrimeAlert, isInstantAlert } from "@/lib/crimeAlert";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "report", 6);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const c = f.citizen;
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
  void recordLogin(c.nik);
  void recordLocation(c.nik, pos.lat, pos.lng);
  // Penjambretan: warn citizens within 2 km right away (not verified yet, says so), with the photo.
  if (isInstantAlert(category)) {
    after(() => instantCrimeAlert({ id: data.id, category, lat: pos.lat, lng: pos.lng, address: cleanText(b?.address, 200) || null, photo_url: photo, nik: c.nik }));
  }
  // AI + BMKG check in the background (after the response is sent): auto-alert only if both confirm.
  // Goes through the AI queue, so a busy AI retries later instead of skipping the check.
  after(async () => { await enqueue(data.id, "triage"); await kickQueue(); });
  // Street address + kecamatan/kota for the console (groups reports by area). Background, best-effort.
  after(() => resolveReportRegion({ id: data.id, lat: pos.lat, lng: pos.lng, address: cleanText(b?.address, 200) || null }));
  return NextResponse.json({ id: data.id, code: reportCode({ id: data.id, kind: "report" }) });
}
