import "server-only";
import { after } from "next/server";
import { isIP } from "node:net";
import { db } from "./supabase";

export type LoginKind = "citizen" | "staff";
export type LoginMethod = "nik" | "password" | "face_verify" | "face_enroll";

export type LoginEntry = {
  kind: LoginKind;
  subject: string;
  display_name?: string | null;
  role?: string | null;
  method: LoginMethod;
  success: boolean;
  reason?: string | null;
};

export type LoginLogRow = LoginEntry & {
  id: number;
  ip: string | null;
  region: string | null;
  country: string | null;
  user_agent: string | null;
  created_at: string;
};

const clip = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null);

export function clientIp(req: Request): string | null {
  const h = req.headers;
  const raw =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip");
  const ip = (raw ?? "").trim().replace(/^::ffff:/, "");
  return ip && isIP(ip) ? ip : null;
}

function isPrivate(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  return /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
}

const decode = (v: string | null) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

type Geo = { region: string | null; country: string | null };

function geoFromHeaders(req: Request): Geo | null {
  const h = req.headers;
  const city = decode(h.get("x-vercel-ip-city") ?? h.get("cf-ipcity"));
  const area = decode(h.get("x-vercel-ip-country-region") ?? h.get("cf-region"));
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  if (!city && !area && !country) return null;
  return { region: [city, area].filter(Boolean).join(", ") || null, country: country && country !== "XX" ? country : null };
}

const geoCache = new Map<string, { at: number; geo: Geo }>();
const GEO_TTL_MS = 6 * 3600_000;

async function geoFromIp(ip: string): Promise<Geo> {
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.geo;
  let geo: Geo = { region: null, country: null };
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country_code`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const j = (await r.json()) as { success?: boolean; city?: string; region?: string; country_code?: string };
    if (j.success) geo = { region: [j.city, j.region].filter(Boolean).join(", ") || null, country: j.country_code ?? null };
  } catch {
  }
  geoCache.set(ip, { at: Date.now(), geo });
  if (geoCache.size > 2000) geoCache.clear();
  return geo;
}

async function resolveGeo(req: Request, ip: string | null): Promise<Geo> {
  const fromHeaders = geoFromHeaders(req);
  if (fromHeaders) return fromHeaders;
  if (!ip) return { region: null, country: null };
  if (isPrivate(ip)) return { region: "Jaringan lokal", country: null };
  if (process.env.LOGIN_GEOIP === "0") return { region: null, country: null };
  return geoFromIp(ip);
}

let tableMissingWarned = false;

export function logLogin(req: Request, entry: LoginEntry): void {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");
  const write = async () => {
    try {
      const geo = await resolveGeo(req, ip);
      const { error } = await db().from("login_logs").insert({
        kind: entry.kind,
        subject: clip(entry.subject, 64) ?? "-",
        display_name: clip(entry.display_name, 120),
        role: clip(entry.role, 20),
        method: entry.method,
        success: entry.success,
        reason: clip(entry.reason, 60),
        ip,
        region: clip(geo.region, 120),
        country: clip(geo.country, 4),
        user_agent: clip(ua, 300),
      });
      if (error && !tableMissingWarned && /login_logs/.test(error.message)) {
        tableMissingWarned = true;
        console.error("[login-log] table public.login_logs is missing. Run supabase/login_logs.sql in the Supabase SQL editor.");
      }
    } catch (e) {
      console.error("[login-log] write failed:", e instanceof Error ? e.message : e);
    }
  };
  try {
    after(write);
  } catch {
    void write();
  }
}

export async function loadLoginLogs(kind: LoginKind, limit = 1000): Promise<{ rows: LoginLogRow[]; missing: boolean }> {
  const { data, error } = await db()
    .from("login_logs")
    .select("id,kind,subject,display_name,role,method,success,reason,ip,region,country,user_agent,created_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { rows: [], missing: /login_logs|does not exist|schema cache/i.test(error.message) };
  return { rows: (data ?? []) as LoginLogRow[], missing: false };
}
