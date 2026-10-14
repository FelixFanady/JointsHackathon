import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./supabase";
import type { Profile, Role } from "./types";

export const ACCESS_COOKIE = "sa_access";
export const REFRESH_COOKIE = "sa_refresh";

/**
 * Short-lived cache of "access token -> active profile". Without it EVERY request (each page
 * navigation, each 15-20 s poll) paid two sequential Supabase round-trips (auth.getUser + profiles)
 * just to learn who is calling. The cache is per server instance and keyed by the token itself.
 * Trade-off: a deactivated/removed user keeps access for at most SESSION_TTL_MS.
 */
const SESSION_TTL_MS = 30_000;
const sessionCache = new Map<string, { at: number; profile: Profile }>();

/** Validates the access token with Supabase and loads the (active) profile. */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const hit = sessionCache.get(token);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.profile;

  // Both lookups need the token's user id, so they cannot run in parallel; the cache removes them from the hot path.
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) {
    sessionCache.delete(token);
    return null;
  }
  const { data: profile } = await db()
    .from("profiles")
    .select("id,username,full_name,role,unit,active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.active) {
    sessionCache.delete(token);
    return null;
  }

  sessionCache.set(token, { at: Date.now(), profile: profile as Profile });
  if (sessionCache.size > 200) {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [k, v] of sessionCache) if (v.at < cutoff) sessionCache.delete(k);
  }
  return profile as Profile;
});

type Guard = { user: Profile; error?: undefined } | { user?: undefined; error: NextResponse };

/** For route handlers: returns the user, or a ready-made 401/403 response. */
export async function guard(roles: Role[]): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 }) };
  if (!roles.includes(user.role)) return { error: NextResponse.json({ error: "Akses ditolak." }, { status: 403 }) };
  return { user };
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

// A username may itself be an email address (used as-is for the auth identity).
export const USERNAME_RE = /^[a-z0-9._-]{3,32}(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$/;
export const emailFor = (username: string) => (username.includes("@") ? username : `${username}@siagaku.internal`);
