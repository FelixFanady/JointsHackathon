import { NextResponse } from "next/server";
import { guard, USERNAME_RE, emailFor } from "@/lib/session";
import { anonDb, db } from "@/lib/supabase";

const attempts = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function tooMany(id: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(id, arr);
  return arr.length >= MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const me = g.user;

  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? "").trim().toLowerCase();
  const password = String(b?.password ?? "");
  const full_name = String(b?.full_name ?? "").trim().replace(/\s+/g, " ");
  const unit = String(b?.unit ?? "").trim().slice(0, 80) || null;
  const confirm = String(b?.confirm_password ?? "");

  if (!USERNAME_RE.test(username)) return NextResponse.json({ error: "Username 3-32 karakter: huruf kecil, angka, titik, strip, garis bawah (boleh berupa email)." }, { status: 400 });
  if (password.length < 10 || password.length > 72) return NextResponse.json({ error: "Kata sandi admin harus 10-72 karakter." }, { status: 400 });
  if (full_name.length < 2 || full_name.length > 100) return NextResponse.json({ error: "Nama harus 2-100 karakter." }, { status: 400 });
  if (!confirm || confirm.length > 200) return NextResponse.json({ error: "Masukkan kata sandi Anda untuk konfirmasi.", code: "confirm_required" }, { status: 400 });

  if (tooMany(me.id)) return NextResponse.json({ error: "Terlalu banyak konfirmasi gagal. Coba lagi dalam 15 menit." }, { status: 429 });
  const { data: auth, error: authErr } = await anonDb().auth.signInWithPassword({ email: emailFor(me.username), password: confirm });
  if (authErr || auth.user?.id !== me.id) {
    attempts.get(me.id)!.push(Date.now());
    return NextResponse.json({ error: "Kata sandi konfirmasi salah.", code: "confirm_wrong" }, { status: 403 });
  }
  attempts.delete(me.id);

  const { data, error } = await db().auth.admin.createUser({ email: emailFor(username), password, email_confirm: true });
  if (error || !data.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json({ error: dup ? "Username sudah dipakai." : "Gagal membuat akun." }, { status: dup ? 409 : 500 });
  }
  const { error: pErr } = await db().from("profiles").insert({ id: data.user.id, username, full_name, role: "admin", unit });
  if (pErr) {
    await db().auth.admin.deleteUser(data.user.id);
    const dup = /duplicate|unique/i.test(pErr.message);
    return NextResponse.json({ error: dup ? "Username sudah dipakai." : "Gagal menyimpan profil." }, { status: dup ? 409 : 500 });
  }
  console.info(`[admin] ${me.username} created admin account ${username}`);
  return NextResponse.json({ ok: true }, { status: 201 });
}
