import { NextResponse } from "next/server";
import { bad, findCitizen, rateLimit } from "@/lib/mobile";

export const dynamic = "force-dynamic";

/** NIK -> citizen name (for "Masuk sebagai ..."). Rate limited to slow NIK enumeration. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "identify", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const c = await findCitizen(b?.nik);
  if (!c) return bad("NIK tidak terdaftar. Hubungi petugas untuk pendaftaran.", 404);
  return NextResponse.json({ nik: c.nik, name: c.full_name });
}
