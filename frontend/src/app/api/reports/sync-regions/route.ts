import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db, fetchAll } from "@/lib/supabase";
import { loadReportRegions, resolveReportRegion } from "@/lib/reportRegion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 6;

export async function POST() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const [{ data }, regions] = await Promise.all([
    fetchAll<{ id: string; lat: number; lng: number; address: string | null }>(
      (a, b) => db().from("reports").select("id,lat,lng,address").gte("created_at", since).order("created_at", { ascending: false }).order("id").range(a, b),
      5000,
    ),
    loadReportRegions(),
  ]);
  const todo = data.filter((r) => !regions.has(r.id));

  let resolved = 0;
  for (const r of todo.slice(0, BATCH)) if (await resolveReportRegion(r)) resolved++;
  return NextResponse.json({ resolved, remaining: Math.max(0, todo.length - BATCH) });
}
