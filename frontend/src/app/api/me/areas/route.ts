import { NextResponse } from "next/server";
import { guard } from "@/lib/session";
import { loadAreas } from "@/lib/supportArea";
import { ALL_AREAS } from "@/lib/provinces";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;
  const areas = g.user.role === "admin" ? [ALL_AREAS] : await loadAreas(g.user.id);
  return NextResponse.json({ areas, role: g.user.role });
}
