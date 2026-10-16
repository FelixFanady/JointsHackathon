import { NextResponse, type NextRequest } from "next/server";

const ACCESS = "sa_access";
const REFRESH = "sa_refresh";
const FACE = "sa_face";

function payloadOf(jwt: string): { exp?: unknown; email?: unknown } {
  try {
    return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

function expiresAt(jwt: string): number {
  const exp = payloadOf(jwt).exp;
  return typeof exp === "number" ? exp * 1000 : 0;
}

function faceExempt(jwt: string): boolean {
  if (process.env.STAFF_FACE_REQUIRED === "0") return true;
  const email = String(payloadOf(jwt).email ?? "").toLowerCase();
  const list = (process.env.STAFF_FACE_EXEMPT ?? "admin@siagaku.gov")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((u) => (u.includes("@") ? u : `${u}@siagaku.internal`));
  return !!email && list.includes(email);
}

function faceFresh(req: NextRequest): boolean {
  const m = /^(?:sf1|sb1)\.(\d{10})\./.exec(req.cookies.get(FACE)?.value ?? "");
  return !!m && Number(m[1]) * 1000 > Date.now();
}

export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS)?.value;
  const refresh = req.cookies.get(REFRESH)?.value;
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  const redirectToLogin = () => {
    if (isApi) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.cookies.delete(ACCESS);
    res.cookies.delete(REFRESH);
    res.cookies.delete(FACE);
    return res;
  };

  const faceGate = (jwt: string, res: NextResponse) => {
    if (isApi || faceExempt(jwt) || faceFresh(req)) return res;
    const url = req.nextUrl.clone();
    url.pathname = "/verify-face";
    url.search = "";
    const r = NextResponse.redirect(url);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!access && !refresh) return redirectToLogin();

  if (access && expiresAt(access) - Date.now() > 30_000) return faceGate(access, NextResponse.next());

  if (!refresh) return redirectToLogin();

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) return redirectToLogin();
    const s = await r.json();
    req.cookies.set(ACCESS, s.access_token);
    req.cookies.set(REFRESH, s.refresh_token);
    const res = NextResponse.next({ request: { headers: req.headers } });
    const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
    res.cookies.set(ACCESS, s.access_token, { ...base, maxAge: s.expires_in });
    res.cookies.set(REFRESH, s.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 14 });
    return faceGate(s.access_token, res);
  } catch {
    return redirectToLogin();
  }
}

export const config = {
  matcher: ["/support/:path*", "/admin/:path*", "/api/((?!auth/|mobile/).*)"],
};
