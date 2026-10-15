import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db, fetchAll } from "@/lib/supabase";
import { loadAllActivity, resolveActivityRegion } from "@/lib/citizenActivity";
import { loadAllProfiles, resolveProfileGeo } from "@/lib/citizenProfile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 6;

export async function POST() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const [{ data: citizens }, profiles, activity] = await Promise.all([
    fetchAll<{ nik: string }>((a, b) => db().from("citizens").select("nik").eq("active", true).order("nik").range(a, b), 5000),
    loadAllProfiles(),
    loadAllActivity(),
  ]);

  const todo: { nik: string; via: "gps" | "address" }[] = [];
  for (const { nik } of citizens ?? []) {
    const a = activity[nik];
    const p = profiles[nik];
    const gpsMoved = a?.last_lat != null && a?.last_lng != null;
    const near = (p?: { lat: number; lng: number } | null) => !!p && Math.abs(p.lat - a!.last_lat!) < 0.01 && Math.abs(p.lng - a!.last_lng!) < 0.01;
    const gpsStale = gpsMoved && !near(a?.region) && !near(a?.region_failed);
    if (gpsStale) todo.push({ nik, via: "gps" });
    else if (!a?.region && p?.address && p.geo?.query !== p.address.trim()) todo.push({ nik, via: "address" });
  }

  let resolved = 0;
  for (const t of todo.slice(0, BATCH)) {
    try {
      const changed = t.via === "gps" ? await resolveActivityRegion(t.nik) : await resolveProfileGeo(t.nik);
      if (changed) resolved++;
    } catch {
    }
  }
  return NextResponse.json({ resolved, remaining: Math.max(0, todo.length - Math.min(todo.length, BATCH)), attempted: Math.min(todo.length, BATCH) });
}
