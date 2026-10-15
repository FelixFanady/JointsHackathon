import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/mobile";
import { cvHealth } from "@/lib/face";
import { db } from "@/lib/supabase";
import { isSealed, open, seal } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type EncState = "ok" | "missing_or_invalid" | "mismatch" | "unknown";

async function encryptionHealth(): Promise<EncState> {
  try {
    seal({}, "health");
  } catch {
    return "missing_or_invalid";
  }
  try {
    const { data } = await db().from("settings").select("key,value").like("key", "citizen_profile:%").limit(5);
    const row = (data ?? []).find((r) => isSealed(r.value));
    if (!row) return "unknown";
    open(row.value, String(row.key));
    return "ok";
  } catch {
    return "mismatch";
  }
}

export async function GET(req: Request) {
  const rl = rateLimit(req, "face-health", 20);
  if (rl) return rl;
  const [h, encryption] = await Promise.all([cvHealth(), encryptionHealth()]);
  const encBad = encryption === "missing_or_invalid" || encryption === "mismatch";
  const body = {
    ...h,
    ok: h.ok && !encBad,
    detail: h.ok && encBad ? `encryption_${encryption}` : h.detail,
    encryption,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
