import "server-only";
import { NextResponse } from "next/server";
import { db, anonDb } from "./supabase";
import { emailFor, guard } from "./session";
import type { Profile } from "./types";

const PREFIX = "super_admin:";
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, number[]>();

export function rootUsernames(): Set<string> {
  const raw = process.env.SUPER_ADMIN_ROOT ?? "admin@siagaku.gov";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export const isRootAdmin = (user: Pick<Profile, "username">) => rootUsernames().has(user.username.toLowerCase());

export async function superAdminIds(): Promise<Set<string>> {
  const { data } = await db().from("settings").select("key").like("key", `${PREFIX}%`).limit(1000);
  return new Set((data ?? []).map((r) => String(r.key).slice(PREFIX.length)));
}

export async function isSuperAdmin(user: Pick<Profile, "id" | "username" | "role">): Promise<boolean> {
  if (user.role !== "admin") return false;
  if (isRootAdmin(user)) return true;
  const { data } = await db().from("settings").select("key").eq("key", PREFIX + user.id).maybeSingle();
  return !!data;
}

export async function setSuperAdmin(userId: string, on: boolean, by: string): Promise<boolean> {
  if (!on) {
    const { error } = await db().from("settings").delete().eq("key", PREFIX + userId);
    return !error;
  }
  const { error } = await db()
    .from("settings")
    .upsert({ key: PREFIX + userId, value: { by, at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return !error;
}

type SuperGuard = { user: Profile; error?: undefined } | { user?: undefined; error: NextResponse };

export async function guardSuperAdmin(): Promise<SuperGuard> {
  const g = await guard(["admin"], { stepUp: true });
  if (g.error) return g;
  if (!(await isSuperAdmin(g.user))) {
    return { error: NextResponse.json({ error: "Hanya Super Administrator yang boleh melakukan ini." }, { status: 403 }) };
  }
  return g;
}

export async function confirmOwnPassword(me: Pick<Profile, "id" | "username">, password: string): Promise<NextResponse | null> {
  if (!password || password.length > 200) {
    return NextResponse.json({ error: "Masukkan kata sandi Anda untuk konfirmasi.", code: "confirm_required" }, { status: 400 });
  }
  const now = Date.now();
  const recent = (attempts.get(me.id) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(me.id, recent);
  if (recent.length >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Terlalu banyak konfirmasi gagal. Coba lagi dalam 15 menit." }, { status: 429 });
  }
  const { data, error } = await anonDb().auth.signInWithPassword({ email: emailFor(me.username), password });
  if (error || data.user?.id !== me.id) {
    recent.push(Date.now());
    return NextResponse.json({ error: "Kata sandi konfirmasi salah.", code: "confirm_wrong" }, { status: 403 });
  }
  attempts.delete(me.id);
  return null;
}
