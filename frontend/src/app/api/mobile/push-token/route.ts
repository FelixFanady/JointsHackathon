import { NextResponse } from "next/server";
import { bad, rateLimit, requireCitizen } from "@/lib/mobile";
import { registerToken, unregisterToken, validToken } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "push-token", 20);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  if (!validToken(b?.token)) return bad("Token perangkat tidak valid.");
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  try {
    if (b.action === "unregister") await unregisterToken(f.citizen.nik, b.token);
    else await registerToken(f.citizen.nik, b.token);
  } catch {
    return bad("Gagal menyimpan token perangkat.", 500);
  }
  return NextResponse.json({ ok: true });
}
