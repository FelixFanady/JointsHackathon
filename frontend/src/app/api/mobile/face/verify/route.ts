import { NextResponse } from "next/server";
import { bad, rateLimit, requireCitizen } from "@/lib/mobile";
import { loadProfile } from "@/lib/citizenProfile";
import {
  MATCH_THRESHOLD, clearFails, confidenceOf, cv, issueFaceToken, lockedMinutes, lockedResponse,
  parseSelfie, reasonMessage, recordFail, type CvCompare,
} from "@/lib/face";

export const dynamic = "force-dynamic";

/**
 * Live selfie vs the citizen's reference photo (the profile photo on the website).
 * The reference is decrypted here, sent only to the internal CV service, and never returned.
 *
 * Body:  { nik, photo: base64 JPEG }
 * 200:   { match: boolean, confidence: 0..1, token?, expires_at? }   (token only when match)
 * 409:   { code: "not_registered" | "reference_unusable" }
 * 422:   { code: <quality reason> }  -- bad selfie, not counted as a failed attempt
 * 429:   { code: "face_locked" }     -- 5 non-matches in 15 min for this NIK
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, "face-verify", 10);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const nik = f.citizen.nik;

  const photo = parseSelfie(b?.photo);
  if (!photo) return bad("Foto wajah tidak valid.", 400);

  const locked = await lockedMinutes(nik);
  if (locked) return lockedResponse(locked);

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
  if (!res) return bad("Layanan verifikasi wajah sedang tidak tersedia. Coba lagi nanti.", 503);
  if (!res.ok) {
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
    return NextResponse.json({ match: false, confidence });
  }
  await clearFails(nik);
  return NextResponse.json({ match: true, confidence, ...issueFaceToken(nik) });
}
