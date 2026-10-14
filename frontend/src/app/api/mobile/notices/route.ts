import { NextResponse } from "next/server";
import { bad, coords, requireCitizen, rateLimit } from "@/lib/mobile";
import { noticesFor } from "@/lib/citizenNotice";
import { recordNoticeFetch } from "@/lib/citizenActivity";

export const dynamic = "force-dynamic";

/**
 * Inbox for the mobile app: notifications Support sent to this citizen (plus broadcasts).
 * POST so the NIK stays out of URLs/logs (same as my-reports). The app polls this; each
 * call also stamps `notices_fetched_at` so Support can see the app is receiving.
 * Body: { nik, since?: ISO } -> { notices: [{ id, title, message, level, kind?, created_at, by }] }
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, "notices", 40);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const c = f.citizen;

  const sinceMs = typeof b?.since === "string" ? Date.parse(b.since) : NaN;
  const all = await noticesFor(c.nik);
  const notices = (Number.isFinite(sinceMs) ? all.filter((n) => Date.parse(n.created_at) > sinceMs) : all).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    level: n.level,
    ...(n.kind ? { kind: n.kind } : {}), // absent on old notices: the app then guesses from the words
    created_at: n.created_at,
    by: n.by,
  }));
  void recordNoticeFetch(c.nik, b?.lat != null && b?.lng != null ? coords(b) : null);
  return NextResponse.json({ notices });
}
