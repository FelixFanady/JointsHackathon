import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { loadSettings } from "@/lib/settings";

export async function GET() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  return NextResponse.json(await loadSettings());
}

export async function PUT(req: Request) {
  const g = await guard(["admin"], { stepUp: true });
  if (g.error) return g.error;

  const b = await req.json().catch(() => null);
  const rules: Record<string, [number, number]> = {
    emergency_threshold: [2, 10000],
    emergency_window_minutes: [1, 1440],
    cluster_radius_m: [50, 5000],
  };
  const rows: { key: string; value: number; updated_at: string }[] = [];
  for (const [key, [min, max]] of Object.entries(rules)) {
    const v = Number(b?.[key]);
    if (!Number.isInteger(v) || v < min || v > max) {
      return NextResponse.json({ error: `${key} harus bilangan bulat ${min}-${max}.` }, { status: 400 });
    }
    rows.push({ key, value: v, updated_at: new Date().toISOString() });
  }
  const { error } = await db().from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await loadSettings());
}
