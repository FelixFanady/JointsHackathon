import { NextResponse } from "next/server";
import { NIK_RE, bad, requireCitizen, rateLimit } from "@/lib/mobile";
import { recordLogin } from "@/lib/citizenActivity";
import { loadProfile } from "@/lib/citizenProfile";
import { isBypassed } from "@/lib/faceBypass";
import { issueFaceToken } from "@/lib/face";
import { logLogin } from "@/lib/loginLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "identify", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik, "NIK tidak terdaftar. Hubungi petugas untuk pendaftaran.");
  if (f.error) {
    const raw = typeof b?.nik === "string" ? b.nik.replace(/\D/g, "").slice(0, 16) : "";
    logLogin(req, {
      kind: "citizen",
      subject: raw || "-",
      method: "nik",
      success: false,
      reason: f.error.status === 403 ? "inactive" : NIK_RE.test(raw) ? "nik_not_found" : "invalid_nik",
    });
    return f.error;
  }
  const c = f.citizen;
  let faceRegistered: boolean;
  try {
    faceRegistered = !!(await loadProfile(c.nik)).photo;
  } catch {
    return bad("Data profil tidak dapat dibuka. Hubungi petugas.", 503);
  }
  void recordLogin(c.nik);
  const bypass = await isBypassed("citizen", c.nik);
  logLogin(req, { kind: "citizen", subject: c.nik, display_name: c.full_name, method: "nik", success: true, ...(bypass ? { reason: "face_bypass" } : {}) });
  return NextResponse.json({
    nik: c.nik,
    name: c.full_name,
    face_registered: faceRegistered,
    ...(bypass ? { face_bypass: true, ...issueFaceToken(c.nik) } : {}),
  });
}
