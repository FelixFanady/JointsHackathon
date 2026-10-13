import { NextResponse, type NextRequest } from "next/server";

const ACCESS = "sa_access";
const REFRESH = "sa_refresh";

function expiresAt(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Keeps the session alive: if the access token is (nearly) expired and a refresh token exists,
 * rotate both cookies. Authorization itself is enforced server-side (layouts + route handlers),
 * this only handles redirects and token refresh.
 */
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
    return res;
  };

  if (!access && !refresh) return redirectToLogin();

  if (access && expiresAt(access) - Date.now() > 30_000) return NextResponse.next();

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
    return res;
  } catch {
    return redirectToLogin();
  }
}

export const config = {
  matcher: ["/support/:path*", "/admin/:path*", "/api/((?!auth/|mobile/).*)"],
};
