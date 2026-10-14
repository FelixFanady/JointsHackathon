import { NextResponse } from "next/server";
import { bad, requireCitizen, rateLimit } from "@/lib/mobile";
import { recordLogin } from "@/lib/citizenActivity";
import { loadProfile } from "@/lib/citizenProfile";

export const dynamic = "force-dynamic";

/** NIK -> citizen name (for "Masuk sebagai ..."). Rate limited to slow NIK enumeration. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "identify", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik, "NIK tidak terdaftar. Hubungi petugas untuk pendaftaran.");
  if (f.error) return f.error;
  const c = f.citizen;
  // Only a yes/no about the reference photo -- the photo itself never goes to the phone.
  let faceRegistered: boolean;
  try {
    faceRegistered = !!(await loadProfile(c.nik)).photo;
  } catch {
    return bad("Data profil tidak dapat dibuka. Hubungi petugas.", 503);
  }
  // Record the login so Support can see each citizen's last-active time and
  // notify on emergencies by recency. Best-effort — never blocks identify.
  void recordLogin(c.nik);
  return NextResponse.json({ nik: c.nik, name: c.full_name, face_registered: faceRegistered });
}
