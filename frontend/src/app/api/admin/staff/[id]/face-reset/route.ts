import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { clearFails } from "@/lib/face";
import { deleteStaffFace, staffLockId } from "@/lib/staffFace";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  const { data } = await db().from("profiles").select("id,username").eq("id", id).in("role", ["admin", "support"]).maybeSingle();
  if (!data) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  if (!(await deleteStaffFace(id))) return NextResponse.json({ error: "Gagal mereset wajah. Coba lagi." }, { status: 500 });
  await clearFails(staffLockId(id));
  console.info(`[admin] ${g.user.username} reset the face of ${data.username}`);
  return NextResponse.json({ ok: true });
}
