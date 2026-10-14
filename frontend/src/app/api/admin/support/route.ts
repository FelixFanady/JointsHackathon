import { NextResponse } from "next/server";
import { guard, USERNAME_RE, emailFor } from "@/lib/session";
import { db } from "@/lib/supabase";
import { saveAreas } from "@/lib/supportArea";

export async function POST(req: Request) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;

  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? "").trim().toLowerCase();
  const password = String(b?.password ?? "");
  const full_name = String(b?.full_name ?? "").trim().replace(/\s+/g, " ");
  const unit = String(b?.unit ?? "").trim().slice(0, 80) || null;

  if (!USERNAME_RE.test(username)) return NextResponse.json({ error: "Username 3-32 karakter: huruf kecil, angka, titik, strip, garis bawah." }, { status: 400 });
  if (password.length < 8 || password.length > 72) return NextResponse.json({ error: "Kata sandi harus 8-72 karakter." }, { status: 400 });
  if (full_name.length < 2 || full_name.length > 100) return NextResponse.json({ error: "Nama harus 2-100 karakter." }, { status: 400 });

  const { data, error } = await db().auth.admin.createUser({ email: emailFor(username), password, email_confirm: true });
  if (error || !data.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json({ error: dup ? "Username sudah dipakai." : "Gagal membuat akun." }, { status: dup ? 409 : 500 });
  }
  const { error: pErr } = await db().from("profiles").insert({ id: data.user.id, username, full_name, role: "support", unit });
  if (pErr) {
    await db().auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: "Gagal menyimpan profil." }, { status: 500 });
  }
  // Assigned provinces chosen in the create form (omitted = whole world, "ALL").
  if (Array.isArray(b?.areas)) await saveAreas(data.user.id, b.areas);
  return NextResponse.json({ ok: true }, { status: 201 });
}
