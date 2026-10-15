import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { rateLimit } from "@/lib/mobile";
import {
  MATCH_THRESHOLD, clearFails, confidenceOf, cv, cvUnavailable, lastCvFailure, lockedMinutes, lockedResponse, parseSelfie, reasonMessage, recordFail, type CvCompare,
} from "@/lib/face";
import { issueStaffFaceToken, issueStepUpToken, loadStaffFace, needsStaffFace, staffFaceCookie, staffFaceVerified, staffLockId, stepUpCookie } from "@/lib/staffFace";
import { logLogin } from "@/lib/loginLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req, "staff-face-verify", 10);
  if (rl) return rl;
  const g = await guard(["admin", "support"], { face: false });
  if (g.error) return g.error;
  const user = g.user;
  if (!needsStaffFace(user)) return NextResponse.json({ error: "Akun ini tidak memerlukan verifikasi wajah." }, { status: 400 });

  const b = await req.json().catch(() => null);
  const stepUp = b?.purpose === "step_up";
  if (stepUp && !(await staffFaceVerified(user))) {
    return NextResponse.json({ error: "Verifikasi wajah diperlukan sebelum bertugas.", code: "staff_face_required" }, { status: 403 });
  }
  const log = (success: boolean, reason?: string) =>
    logLogin(req, {
      kind: "staff", subject: user.username, display_name: user.full_name, role: user.role, method: "face_verify", success,
      reason: stepUp && reason ? `step_up ${reason}` : reason,
    });

  const photo = parseSelfie(b?.photo);
  if (!photo) return NextResponse.json({ error: "Foto wajah tidak valid." }, { status: 400 });

  const lockId = staffLockId(user.id);
  const locked = await lockedMinutes(lockId);
  if (locked) {
    log(false, "locked");
    return lockedResponse(locked);
  }

  let reference: string | undefined;
  try {
    reference = (await loadStaffFace(user.id))?.photo;
  } catch {
    return NextResponse.json({ error: "Data wajah tidak dapat dibuka. Hubungi admin." }, { status: 503 });
  }
  if (!reference) return NextResponse.json({ error: "Wajah belum terdaftar.", code: "not_registered" }, { status: 409 });

  const res = await cv<CvCompare>("/v1/compare", { probe: photo, reference });
  if (!res) {
    log(false, lastCvFailure());
    return cvUnavailable();
  }
  if (!res.ok) {
    log(false, res.reason);
    if (res.reason === "reference_unusable") {
      return NextResponse.json({ error: "Foto wajah Anda di sistem tidak bisa dipakai. Minta admin mereset wajah Anda.", code: "reference_unusable" }, { status: 409 });
    }
    return NextResponse.json({ error: reasonMessage(res.reason), code: res.reason }, { status: 422 });
  }

  const match = res.similarity >= MATCH_THRESHOLD;
  const confidence = confidenceOf(res.similarity);
  if (!match) {
    await recordFail(lockId);
    log(false, `face_mismatch ${Math.round(confidence * 100)}%`);
    console.warn(`[staff-face] ${user.username} failed face ${stepUp ? "step-up" : "verification"}`);
    return NextResponse.json({ match: false, confidence });
  }
  await clearFails(lockId);
  log(true, `match ${Math.round(confidence * 100)}%`);
  const out = NextResponse.json({ match: true, confidence });
  out.cookies.set(staffFaceCookie(issueStaffFaceToken(user.id)));
  if (stepUp) out.cookies.set(stepUpCookie(issueStepUpToken(user.id)));
  return out;
}
