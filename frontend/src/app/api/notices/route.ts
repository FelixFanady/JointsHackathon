import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { clean, recentNotices, sendNotices, type NoticeLevel } from "@/lib/citizenNotice";

export const dynamic = "force-dynamic";

/** Support/admin: recent notifications they sent. */
export async function GET() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  return NextResponse.json({ notices: await recentNotices(30) });
}

/** Support/admin: send a notification. Body: { targets: "all" | string[] (NIKs), title, message, level? } */
export async function POST(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const b = await req.json().catch(() => null);

  const title = clean(b?.title, 80);
  const message = clean(b?.message, 500);
  const level: NoticeLevel = b?.level === "warning" || b?.level === "danger" ? b.level : "info";
  if (title.length < 2) return NextResponse.json({ error: "Judul minimal 2 karakter." }, { status: 400 });
  if (message.length < 2) return NextResponse.json({ error: "Isi pesan minimal 2 karakter." }, { status: 400 });

  let targets: { to: string; to_name: string | null }[];
  if (b?.targets === "all") {
    targets = [{ to: "all", to_name: null }];
  } else if (Array.isArray(b?.targets) && b.targets.length > 0 && b.targets.length <= 500) {
    const niks = [...new Set(b.targets as unknown[])];
    if (!niks.every((n) => typeof n === "string" && /^\d{16}$/.test(n))) {
      return NextResponse.json({ error: "NIK penerima tidak valid." }, { status: 400 });
    }
    const { data, error } = await db().from("citizens").select("nik,full_name,active").in("nik", niks as string[]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targets = (data ?? []).filter((c) => c.active).map((c) => ({ to: c.nik, to_name: c.full_name }));
    if (!targets.length) return NextResponse.json({ error: "Tidak ada penerima aktif." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Pilih penerima." }, { status: 400 });
  }

  const err = await sendNotices(targets, { title, message, level, by: g.user.full_name });
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ sent: targets.length, broadcast: b?.targets === "all" }, { status: 201 });
}
