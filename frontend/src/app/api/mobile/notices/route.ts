import { NextResponse } from "next/server";
import { bad, coords, requireCitizen, rateLimit } from "@/lib/mobile";
import { requireFaceSession } from "@/lib/face";
import { noticesFor } from "@/lib/citizenNotice";
import { recordNoticeFetch } from "@/lib/citizenActivity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "notices", 40);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const c = f.citizen;
  const fs = requireFaceSession(req, c.nik);
  if (fs) return fs;

  const sinceMs = typeof b?.since === "string" ? Date.parse(b.since) : NaN;
  const all = await noticesFor(c.nik);
  const notices = (Number.isFinite(sinceMs) ? all.filter((n) => Date.parse(n.created_at) > sinceMs) : all).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    level: n.level,
    ...(n.kind ? { kind: n.kind } : {}),
    ...(n.photo_url ? { photo_url: n.photo_url } : {}),
    ...(n.report_id ? { report_id: n.report_id } : {}),
    created_at: n.created_at,
    by: n.by,
  }));
  void recordNoticeFetch(c.nik, b?.lat != null && b?.lng != null ? coords(b) : null);
  return NextResponse.json({ notices });
}
