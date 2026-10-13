import { NextResponse } from "next/server";
import { anonDb, db } from "@/lib/supabase";
import { ACCESS_COOKIE, REFRESH_COOKIE, USERNAME_RE, cookieOptions, emailFor } from "@/lib/session";

const BAD = { error: "Username atau kata sandi salah." };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const remember = Boolean(body?.remember);

  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 200) {
    return NextResponse.json(BAD, { status: 401 });
  }

  const { data, error } = await anonDb().auth.signInWithPassword({ email: emailFor(username), password });
  if (error || !data.session) return NextResponse.json(BAD, { status: 401 });

  const { data: profile } = await db()
    .from("profiles")
    .select("id,role,active,full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.active) {
    return NextResponse.json({ error: "Akun tidak aktif. Hubungi admin." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, role: profile.role });
  res.cookies.set(ACCESS_COOKIE, data.session.access_token, cookieOptions(data.session.expires_in));
  res.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions(remember ? 60 * 60 * 24 * 14 : 60 * 60 * 12));
  return res;
}
