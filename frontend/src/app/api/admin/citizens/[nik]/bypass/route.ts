import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { setBypass } from "@/lib/faceBypass";
import { confirmOwnPassword, guardSuperAdmin } from "@/lib/superAdmin";

type Ctx = { params: Promise<{ nik: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const g = await guardSuperAdmin();
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });

  const b = await req.json().catch(() => null);
  if (typeof b?.bypass !== "boolean") return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });

  const { data: citizen } = await db().from("citizens").select("nik").eq("nik", nik).maybeSingle();
  if (!citizen) return NextResponse.json({ error: "NIK tidak ditemukan." }, { status: 404 });

  const denied = await confirmOwnPassword(g.user, String(b?.confirm_password ?? ""));
  if (denied) return denied;

  if (!(await setBypass("citizen", nik, b.bypass, g.user.username))) {
    return NextResponse.json({ error: "Gagal menyimpan pengaturan. Coba lagi." }, { status: 500 });
  }
  console.info(`[admin] ${g.user.username} ${b.bypass ? "enabled" : "disabled"} face bypass for ${nik.slice(0, 6)}**********`);
  return NextResponse.json({ ok: true });
}
