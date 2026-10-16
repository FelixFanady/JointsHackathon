import { NextResponse } from "next/server";
import { dropSessionsFor } from "@/lib/session";
import { db } from "@/lib/supabase";
import { confirmOwnPassword, guardSuperAdmin, isRootAdmin, setSuperAdmin } from "@/lib/superAdmin";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guardSuperAdmin();
  if (g.error) return g.error;
  const me = g.user;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Admin tidak ditemukan." }, { status: 404 });

  const b = await req.json().catch(() => null);
  const { data: target } = await db().from("profiles").select("id,username,full_name,role,active").eq("id", id).eq("role", "admin").maybeSingle();
  if (!target) return NextResponse.json({ error: "Admin tidak ditemukan." }, { status: 404 });

  const wantActive = typeof b?.active === "boolean" ? b.active : undefined;
  const wantSuper = typeof b?.super === "boolean" ? b.super : undefined;
  const wantPassword = typeof b?.password === "string" ? b.password : undefined;
  if (wantActive === undefined && wantSuper === undefined && wantPassword === undefined) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const targetRoot = isRootAdmin(target);
  if (targetRoot && me.id !== target.id) {
    return NextResponse.json({ error: "Akun utama hanya bisa diubah oleh pemiliknya sendiri." }, { status: 403 });
  }
  if (targetRoot && (wantActive !== undefined || wantSuper !== undefined)) {
    return NextResponse.json({ error: "Akun utama tidak bisa dinonaktifkan atau diubah status Super-nya." }, { status: 400 });
  }
  if (wantActive === false && target.id === me.id) {
    return NextResponse.json({ error: "Anda tidak bisa menonaktifkan akun Anda sendiri." }, { status: 400 });
  }
  if (wantPassword !== undefined && (wantPassword.length < 10 || wantPassword.length > 72)) {
    return NextResponse.json({ error: "Kata sandi admin harus 10-72 karakter." }, { status: 400 });
  }

  const denied = await confirmOwnPassword(me, String(b?.confirm_password ?? ""));
  if (denied) return denied;

  if (wantPassword !== undefined) {
    const { error } = await db().auth.admin.updateUserById(id, { password: wantPassword });
    if (error) return NextResponse.json({ error: "Gagal mengganti kata sandi." }, { status: 500 });
    console.info(`[admin] ${me.username} changed the password of admin ${target.username}`);
  }
  if (wantSuper !== undefined) {
    if (!(await setSuperAdmin(id, wantSuper, me.username))) {
      return NextResponse.json({ error: "Gagal mengubah status Super Administrator." }, { status: 500 });
    }
    console.info(`[admin] ${me.username} ${wantSuper ? "granted" : "revoked"} Super Administrator for ${target.username}`);
  }
  if (wantActive !== undefined) {
    const { error } = await db().from("profiles").update({ active: wantActive }).eq("id", id);
    if (error) return NextResponse.json({ error: "Gagal mengubah status akun." }, { status: 500 });
    console.info(`[admin] ${me.username} ${wantActive ? "activated" : "deactivated"} admin ${target.username}`);
  }
  dropSessionsFor(id);
  return NextResponse.json({ ok: true });
}
