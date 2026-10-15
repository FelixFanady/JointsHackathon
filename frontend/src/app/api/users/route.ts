import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { db, fetchAll } from "@/lib/supabase";
import { loadAllProfiles } from "@/lib/citizenProfile";
import { loadAllActivity } from "@/lib/citizenActivity";
import { inScope, scopeFor } from "@/lib/supportArea";

export const dynamic = "force-dynamic";

type R = { province?: string | null; city?: string | null; district?: string | null; village?: string | null; label?: string; source?: string; failed?: boolean };
function pickRegion(gps?: R | null, addr?: R | null) {
  const r = gps ?? (addr && !addr.failed ? addr : null);
  if (!r || !r.label) return null;
  return { province: r.province ?? null, city: r.city ?? null, district: r.district ?? null, village: r.village ?? null, label: r.label, source: (gps ? "gps" : "address") as "gps" | "address" };
}

export async function GET(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const withPhotos = new URL(req.url).searchParams.get("photos") !== "0";

  const [{ data: citizens, error }, profiles, activity, scope] = await Promise.all([
    fetchAll<{ nik: string; full_name: string; active: boolean; created_at: string }>(
      (a, b) => db().from("citizens").select("nik,full_name,active,created_at").order("full_name", { ascending: true }).order("nik").range(a, b),
      5000,
    ),
    loadAllProfiles(),
    loadAllActivity(),
    scopeFor(g.user),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (citizens ?? []).map((c) => {
    const p = profiles[c.nik] ?? {};
    const a = activity[c.nik] ?? {};
    return {
      nik: c.nik,
      nik_masked: `${c.nik.slice(0, 6)}••••••${c.nik.slice(-4)}`,
      full_name: c.full_name,
      active: c.active,
      area: p.address ?? null,
      phone: p.phone ?? null,
      photo: withPhotos ? p.photo ?? null : null,
      last_login: a.last_login ?? null,
      last_lat: a.last_lat ?? null,
      last_lng: a.last_lng ?? null,
      last_seen_at: a.last_seen_at ?? null,
      notices_fetched_at: a.notices_fetched_at ?? null,
      region: pickRegion(a.region, p.geo),
      region_pending: !!(a.last_lat != null && !a.region && !a.region_failed) || !!(!a.region && p.address && p.geo?.query !== p.address.trim()),
    };
  });

  return NextResponse.json({ users: scope === null ? users : users.filter((u) => inScope(scope, u.region?.province)) });
}
