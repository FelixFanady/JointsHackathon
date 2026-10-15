import { NextResponse } from "next/server";
import { anonDb, db } from "@/lib/supabase";
import { ACCESS_COOKIE, REFRESH_COOKIE, USERNAME_RE, cookieOptions, emailFor } from "@/lib/session";
import { logLogin } from "@/lib/loginLog";

const BAD = { error: "Username atau kata sandi salah." };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const fail = (reason: string, extra: { display_name?: string; role?: string } = {}) =>
    logLogin(req, { kind: "staff", subject: username || "-", method: "password", success: false, reason, ...extra });

  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 200) {
    fail("invalid_input");
    return NextResponse.json(BAD, { status: 401 });
  }

  const { data, error } = await anonDb().auth.signInWithPassword({ email: emailFor(username), password });
  if (error || !data.session) {
    fail("wrong_credentials");
    return NextResponse.json(BAD, { status: 401 });
  }

  const { data: profile } = await db()
    .from("profiles")
    .select("id,role,active,full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.active) {
    fail(profile ? "inactive" : "no_profile", { display_name: profile?.full_name, role: profile?.role });
    return NextResponse.json({ error: "Akun tidak aktif. Hubungi admin." }, { status: 403 });
  }

  logLogin(req, { kind: "staff", subject: username, display_name: profile.full_name, role: profile.role, method: "password", success: true });
  const res = NextResponse.json({ ok: true, role: profile.role });
  res.cookies.set(ACCESS_COOKIE, data.session.access_token, cookieOptions(data.session.expires_in));
  res.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions(60 * 60 * 12));
  return res;
}
