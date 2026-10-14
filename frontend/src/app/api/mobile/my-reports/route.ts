import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bad, requireCitizen, rateLimit } from "@/lib/mobile";

export const dynamic = "force-dynamic";

/** The citizen's own reports. POST so the NIK never lands in URL/access logs. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "mine", 30);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const c = f.citizen;
  const { data, error } = await db()
    .from("reports")
    .select("id,kind,category,description,address,status,lat,lng,created_at")
    .eq("nik", c.nik)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return bad("Gagal memuat laporan.", 500);
  return NextResponse.json({ reports: data });
}
