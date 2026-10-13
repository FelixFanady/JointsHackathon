import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";

const COLS =
  "id,kind,nik,reporter_name,category,description,photo_url,lat,lng,address,status,reviewed_by,reviewed_at,ai_verdict,ai_checked_at,created_at";

export async function GET(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const url = new URL(req.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24 * 30, 1), 24 * 365);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");

  let q = db()
    .from("reports")
    .select(COLS)
    .gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);
  if (status === "pending" || status === "valid" || status === "false") q = q.eq("status", status);
  if (kind === "sos" || kind === "report") q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data });
}

/** Mark one or many reports as valid / false. Body: { ids: string[], status: "valid" | "false" } */
export async function PATCH(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  const ids: unknown = body?.ids;
  if ((status !== "valid" && status !== "false") || !Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((i) => typeof i === "string" && uuid.test(i))) {
    return NextResponse.json({ error: "ID laporan tidak valid." }, { status: 400 });
  }

  const { data, error } = await db()
    .from("reports")
    .update({ status, reviewed_by: g.user.id, reviewed_at: new Date().toISOString() })
    .in("id", ids as string[])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data?.length ?? 0 });
}
