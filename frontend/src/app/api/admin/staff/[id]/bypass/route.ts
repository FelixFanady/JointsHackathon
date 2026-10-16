import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { setBypass } from "@/lib/faceBypass";
import { confirmOwnPassword, guardSuperAdmin, isRootAdmin } from "@/lib/superAdmin";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: Ctx) {
  const g = await guardSuperAdmin();
  if (g.error) return g.error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });

  const b = await req.json().catch(() => null);
  if (typeof b?.bypass !== "boolean") return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });

  const { data: target } = await db().from("profiles").select("id,username,role").eq("id", id).in("role", ["admin", "support"]).maybeSingle();
  if (!target) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  if (target.role === "admin" && isRootAdmin(target)) {
    return NextResponse.json({ error: "Akun utama sudah dikecualikan dari verifikasi wajah." }, { status: 400 });
  }

  const denied = await confirmOwnPassword(g.user, String(b?.confirm_password ?? ""));
  if (denied) return denied;

  if (!(await setBypass("staff", id, b.bypass, g.user.username))) {
    return NextResponse.json({ error: "Gagal menyimpan pengaturan. Coba lagi." }, { status: 500 });
  }
  console.info(`[admin] ${g.user.username} ${b.bypass ? "enabled" : "disabled"} face bypass for ${target.username}`);
  return NextResponse.json({ ok: true });
}
