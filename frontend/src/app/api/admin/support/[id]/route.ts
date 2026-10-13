import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only support accounts are manageable here; admin accounts are never touched. */
async function loadSupport(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await db().from("profiles").select("id,role").eq("id", id).eq("role", "support").maybeSingle();
  return data;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { id } = await params;
  if (!(await loadSupport(id))) return NextResponse.json({ error: "Akun support tidak ditemukan." }, { status: 404 });

  const b = await req.json().catch(() => null);
  const patch: { active?: boolean; full_name?: string; unit?: string | null } = {};
  if (typeof b?.active === "boolean") patch.active = b.active;
  if (typeof b?.full_name === "string") {
    const n = b.full_name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 100) return NextResponse.json({ error: "Nama harus 2-100 karakter." }, { status: 400 });
    patch.full_name = n;
  }
  if (typeof b?.unit === "string") patch.unit = b.unit.trim().slice(0, 80) || null;

  if (typeof b?.password === "string") {
    if (b.password.length < 8 || b.password.length > 72) return NextResponse.json({ error: "Kata sandi harus 8-72 karakter." }, { status: 400 });
    const { error } = await db().auth.admin.updateUserById(id, { password: b.password });
    if (error) return NextResponse.json({ error: "Gagal mengganti kata sandi." }, { status: 500 });
  }
  if (Object.keys(patch).length) {
    const { error } = await db().from("profiles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { id } = await params;
  if (!(await loadSupport(id))) return NextResponse.json({ error: "Akun support tidak ditemukan." }, { status: 404 });
  const { error } = await db().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: "Gagal menghapus akun." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
