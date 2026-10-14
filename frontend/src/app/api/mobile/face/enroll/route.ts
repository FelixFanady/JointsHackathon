import { NextResponse } from "next/server";
import { bad, rateLimit, requireCitizen } from "@/lib/mobile";
import { loadProfile, saveProfile } from "@/lib/citizenProfile";
import { cv, issueFaceToken, lockedMinutes, lockedResponse, parseSelfie, reasonMessage, type CvEnroll } from "@/lib/face";

export const dynamic = "force-dynamic";

/**
 * First-time face enrolment: ONLY for a citizen who has no reference photo yet.
 * Once a photo exists (set by an admin or by an earlier enrolment) this endpoint refuses,
 * so nobody can overwrite someone else's face from the app -- resetting it is an admin action
 * (remove the photo on the website).
 *
 * Body:  { nik, photo: base64 JPEG (live selfie after the in-app liveness check) }
 * 200:   { registered: true, match: true, confidence: 1, token, expires_at }
 * 409:   { code: "already_registered" }   422: { code: <quality reason> }
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, "face-enroll", 5);
  if (rl) return rl;
  const b = await req.json().catch(() => null);
  const f = await requireCitizen(b?.nik);
  if (f.error) return f.error;
  const nik = f.citizen.nik;

  const photo = parseSelfie(b?.photo);
  if (!photo) return bad("Foto wajah tidak valid.", 400);

  const locked = await lockedMinutes(nik);
  if (locked) return lockedResponse(locked);

  const hasPhoto = async () => !!(await loadProfile(nik)).photo;
  try {
    if (await hasPhoto()) {
      return NextResponse.json({ error: "Wajah sudah terdaftar. Silakan verifikasi wajah.", code: "already_registered" }, { status: 409 });
    }
  } catch {
    return bad("Data profil tidak dapat dibuka. Hubungi petugas.", 503);
  }

  const res = await cv<CvEnroll>("/v1/enroll", { image: photo });
  if (!res) return bad("Layanan verifikasi wajah sedang tidak tersedia. Coba lagi nanti.", 503);
  if (!res.ok) return NextResponse.json({ error: reasonMessage(res.reason), code: res.reason }, { status: 422 });

  try {
    // Re-check right before writing: another device may have enrolled this NIK meanwhile.
    if (await hasPhoto()) {
      return NextResponse.json({ error: "Wajah sudah terdaftar. Silakan verifikasi wajah.", code: "already_registered" }, { status: 409 });
    }
    // Stored encrypted (lib/crypto.ts) as the citizen's profile photo; re-encoded by the CV service (EXIF/GPS stripped).
    const err = await saveProfile(nik, {
      photo: `data:image/jpeg;base64,${res.photo_jpeg_b64}`,
      face: { source: "self", enrolled_at: new Date().toISOString() },
    });
    if (err) return bad("Gagal menyimpan wajah. Coba lagi.", 500);
  } catch {
    return bad("Data profil tidak dapat disimpan. Hubungi petugas.", 503);
  }

  return NextResponse.json({ registered: true, match: true, confidence: 1, ...issueFaceToken(nik) });
}
