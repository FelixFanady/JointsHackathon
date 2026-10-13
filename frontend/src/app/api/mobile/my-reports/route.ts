import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, findCitizen, rateLimit } from "@/lib/mobile";

export const dynamic = "force-dynamic";

/** The citizen's own reports. POST so the NIK never lands in URL/access logs. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "mine", 30);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const c = await findCitizen(b?.nik);
  if (!c) return bad("NIK tidak terdaftar.", 404);
  const { data, error } = await db()
    .from("reports")
    .select("id,kind,category,description,address,status,lat,lng,created_at")
    .eq("nik", c.nik)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return bad("Gagal memuat laporan.", 500);
  return NextResponse.json({ reports: data });
}
