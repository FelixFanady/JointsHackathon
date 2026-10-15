import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { rateLimit } from "@/lib/mobile";
import { clearFails, cv, cvUnavailable, parseSelfie, reasonMessage, type CvEnroll } from "@/lib/face";
import { loadStaffFace, saveStaffFace, staffLockId } from "@/lib/staffFace";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffAccount(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await db().from("profiles").select("id,username,full_name").eq("id", id).in("role", ["admin", "support"]).maybeSingle();
  return data;
}

export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { id } = await params;
  if (!(await staffAccount(id))) return new NextResponse(null, { status: 404 });
  let photo: string | undefined;
  try {
    photo = (await loadStaffFace(id))?.photo;
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  const b64 = photo?.startsWith("data:image/jpeg;base64,") ? photo.slice(23) : null;
  if (!b64) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(b64, "base64")), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const rl = rateLimit(req, "admin-staff-face", 10);
  if (rl) return rl;
  const g = await guard(["admin"], { stepUp: true });
  if (g.error) return g.error;
  const { id } = await params;
  const acct = await staffAccount(id);
  if (!acct) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });

  const b = await req.json().catch(() => null);
  const photo = parseSelfie(b?.photo);
  if (!photo) return NextResponse.json({ error: "Foto tidak valid. Gunakan file JPG/PNG yang jelas." }, { status: 400 });

  const res = await cv<CvEnroll>("/v1/enroll", { image: photo });
  if (!res) return cvUnavailable();
  if (!res.ok) return NextResponse.json({ error: reasonMessage(res.reason), code: res.reason }, { status: 422 });

  try {
    if (!(await saveStaffFace(id, `data:image/jpeg;base64,${res.photo_jpeg_b64}`))) {
      return NextResponse.json({ error: "Gagal menyimpan foto. Coba lagi." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Foto tidak dapat disimpan. Hubungi admin." }, { status: 503 });
  }
  await clearFails(staffLockId(id));
  console.info(`[admin] ${g.user.username} uploaded a face photo for ${acct.username}`);
  return NextResponse.json({ ok: true, enrolled_at: new Date().toISOString() });
}
