import { NextResponse } from "next/server";
import { bad, rateLimit, requireCitizen } from "@/lib/mobile";
import { loadProfile } from "@/lib/citizenProfile";
import {
  MATCH_THRESHOLD, clearFails, confidenceOf, cv, cvUnavailable, lastCvFailure, issueFaceToken, lockedMinutes, lockedResponse,
  parseSelfie, reasonMessage, recordFail, type CvCompare,
} from "@/lib/face";
import { logLogin } from "@/lib/loginLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "face-verify", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const nik = f.citizen.nik;
  const log = (success: boolean, reason?: string) =>
    logLogin(req, { kind: "citizen", subject: nik, display_name: f.citizen.full_name, method: "face_verify", success, reason });

  const photo = parseSelfie(b?.photo);
  if (!photo) return bad("Foto wajah tidak valid.", 400);

  const locked = await lockedMinutes(nik);
  if (locked) {
    log(false, "locked");
    return lockedResponse(locked);
  }

  let reference: string | null | undefined;
  try {
    reference = (await loadProfile(nik)).photo;
  } catch {
    return bad("Data profil tidak dapat dibuka. Hubungi petugas.", 503);
  }
  if (!reference) {
    return NextResponse.json({ error: "Wajah belum terdaftar. Daftarkan wajah terlebih dahulu.", code: "not_registered" }, { status: 409 });
  }

  const res = await cv<CvCompare>("/v1/compare", { probe: photo, reference });
  if (!res) {
    log(false, lastCvFailure());
    return cvUnavailable();
  }
  if (!res.ok) {
    log(false, res.reason);
    if (res.reason === "reference_unusable") {
      return NextResponse.json(
        { error: "Foto profil Anda di sistem tidak bisa dipakai untuk verifikasi. Hubungi petugas untuk memperbarui foto.", code: "reference_unusable" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: reasonMessage(res.reason), code: res.reason }, { status: 422 });
  }

  const match = res.similarity >= MATCH_THRESHOLD;
  const confidence = confidenceOf(res.similarity);
  if (!match) {
    await recordFail(nik);
    log(false, `face_mismatch ${Math.round(confidence * 100)}%`);
    return NextResponse.json({ match: false, confidence });
  }
  await clearFails(nik);
  log(true, `match ${Math.round(confidence * 100)}%`);
  return NextResponse.json({ match: true, confidence, ...issueFaceToken(nik) });
}
