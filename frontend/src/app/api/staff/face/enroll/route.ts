import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { rateLimit } from "@/lib/mobile";
import { cv, cvUnavailable, lockedMinutes, lockedResponse, parseSelfie, reasonMessage, type CvEnroll } from "@/lib/face";
import { issueStaffFaceToken, loadStaffFace, needsStaffFace, saveStaffFace, staffFaceCookie, staffLockId } from "@/lib/staffFace";
import { logLogin } from "@/lib/loginLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "staff-face-enroll", 5);
  if (rl) return rl;
  const g = await guard(["admin", "support"], { face: false });
  if (g.error) return g.error;
  const user = g.user;
  if (!needsStaffFace(user)) return NextResponse.json({ error: "Akun ini tidak memerlukan verifikasi wajah." }, { status: 400 });

  const b = await req.json().catch(() => null);
  const photo = parseSelfie(b?.photo);
  if (!photo) return NextResponse.json({ error: "Foto wajah tidak valid." }, { status: 400 });

  const locked = await lockedMinutes(staffLockId(user.id));
  if (locked) return lockedResponse(locked);

  const exists = async () => !!(await loadStaffFace(user.id));
  try {
    if (await exists()) return NextResponse.json({ error: "Wajah sudah terdaftar. Silakan verifikasi.", code: "already_registered" }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Data wajah tidak dapat dibuka. Hubungi admin." }, { status: 503 });
  }

  const res = await cv<CvEnroll>("/v1/enroll", { image: photo });
  const log = (success: boolean, reason?: string) =>
    logLogin(req, { kind: "staff", subject: user.username, display_name: user.full_name, role: user.role, method: "face_enroll", success, reason });
  if (!res) {
    log(false, "cv_unavailable");
    return cvUnavailable();
  }
  if (!res.ok) {
    log(false, res.reason);
    return NextResponse.json({ error: reasonMessage(res.reason), code: res.reason }, { status: 422 });
  }

  try {
    if (await exists()) return NextResponse.json({ error: "Wajah sudah terdaftar. Silakan verifikasi.", code: "already_registered" }, { status: 409 });
    if (!(await saveStaffFace(user.id, `data:image/jpeg;base64,${res.photo_jpeg_b64}`))) {
      return NextResponse.json({ error: "Gagal menyimpan wajah. Coba lagi." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Data wajah tidak dapat disimpan. Hubungi admin." }, { status: 503 });
  }

  console.info(`[staff-face] ${user.username} enrolled a face`);
  log(true, "enrolled");
  const out = NextResponse.json({ match: true, registered: true });
  out.cookies.set(staffFaceCookie(issueStaffFaceToken(user.id)));
  return out;
}
