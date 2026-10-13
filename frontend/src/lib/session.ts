import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./supabase";
import type { Profile, Role } from "./types";

export const ACCESS_COOKIE = "sa_access";
export const REFRESH_COOKIE = "sa_refresh";

/** Validates the access token with Supabase and loads the (active) profile. */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db()
    .from("profiles")
    .select("id,username,full_name,role,unit,active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return null;
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
