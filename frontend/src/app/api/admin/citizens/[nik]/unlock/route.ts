import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { unlockFace } from "@/lib/face";

type Ctx = { params: Promise<{ nik: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const g = await guard(["admin"]);
  if (g.error) return g.error;
  const { nik } = await params;
  if (!/^\d{16}$/.test(nik)) return NextResponse.json({ error: "NIK tidak valid." }, { status: 400 });
  if (!(await unlockFace(nik))) return NextResponse.json({ error: "Gagal membuka kunci. Coba lagi." }, { status: 500 });
  console.info(`[admin] ${g.user.username} unlocked face login for ${nik.slice(0, 6)}**********`);
  return NextResponse.json({ ok: true });
}
