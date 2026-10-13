import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ nik: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });
  const b = await req.json().catch(() => null);
  const patch: { full_name?: string; active?: boolean } = {};
  if (typeof b?.full_name === "string") {
    const n = b.full_name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 100) return NextResponse.json({ error: "Nama harus 2-100 karakter." }, { status: 400 });
    patch.full_name = n;
  }
  if (typeof b?.active === "boolean") patch.active = b.active;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  const { error } = await db().from("citizens").update(patch).eq("nik", nik);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });
  const { error } = await db().from("citizens").delete().eq("nik", nik);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
