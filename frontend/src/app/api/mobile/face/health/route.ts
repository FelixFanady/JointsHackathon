import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/mobile";
import { cvHealth } from "@/lib/face";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = rateLimit(req, "face-health", 20);
  if (rl) return rl;
  const h = await cvHealth();
  return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
