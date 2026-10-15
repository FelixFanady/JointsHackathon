import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";

export async function GET(req: Request) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 50);
  let query = db()
    .from("citizens")
    .select("nik,full_name,active,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q)
    query = /^\d+$/.test(q)
      ? query.like("nik", `${q}%`)
      : query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ citizens: data });
}

export async function POST(req: Request) {
  const g = await guard(["admin"], { stepUp: true });
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);
  const nik = String(b?.nik ?? "").trim();
  const full_name = String(b?.full_name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!/^\d{16}$/.test(nik))
    return NextResponse.json(
      { error: "NIK harus 16 digit angka." },
      { status: 400 },
    );
  if (full_name.length < 2 || full_name.length > 100)
    return NextResponse.json(
      { error: "Nama harus 2-100 karakter." },
      { status: 400 },
    );

  const { error } = await db()
    .from("citizens")
    .insert({ nik, full_name, created_by: g.user.id });
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "NIK sudah terdaftar." : error.message },
      { status: dup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
