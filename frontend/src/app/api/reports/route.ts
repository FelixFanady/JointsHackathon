import { NextResponse, after } from "next/server";
import { guard } from "@/lib/session";
import { db, fetchAll } from "@/lib/supabase";
import { loadAiRunning } from "@/lib/aiRunning";
import { loadReportRegions, reportsInScope } from "@/lib/reportRegion";
import { inScope, scopeFor } from "@/lib/supportArea";
import { dropJobs, jobActive, loadQueue, sweepAndKick } from "@/lib/aiQueue";
import { loadAiReviews, recordAiReview } from "@/lib/aiReview";

const COLS =
  "id,kind,nik,reporter_name,category,description,photo_url,lat,lng,address,status,reviewed_by,reviewed_at,ai_verdict,ai_checked_at,created_at";

export async function GET(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const url = new URL(req.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24 * 30, 1), 24 * 365);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  if (id !== null && !/^[0-9a-f-]{8,64}$/i.test(id)) return NextResponse.json({ error: "ID laporan tidak valid." }, { status: 400 });

  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const page = (a: number, b: number) => {
    let q = db().from("reports").select(COLS);
    if (id) q = q.eq("id", id);
    else q = q.gte("created_at", since);
    if (status === "pending" || status === "valid" || status === "false") q = q.eq("status", status);
    if (kind === "sos" || kind === "report") q = q.eq("kind", kind);
    return q.order("created_at", { ascending: false }).order("id").range(a, b);
  };

  const [{ data, error }, running, regions, scope, queue, reviews] = await Promise.all([fetchAll(page, 5000), loadAiRunning(), loadReportRegions(), scopeFor(g.user), loadQueue(), loadAiReviews()]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  after(() => sweepAndKick(data ?? [], queue, running));
  return NextResponse.json({
    areas: scope === null ? null : [...scope].sort((a, b) => a.localeCompare(b, "id")),
    reports: (data ?? []).filter((r) => scope === null || inScope(scope, regions.get(r.id)?.region?.province)).map((r) => {
      const g = regions.get(r.id);
      const job = queue.get(r.id);
      const stale = !!job && !!r.ai_verdict && Date.parse(String(r.ai_checked_at ?? "")) >= Date.parse(job.at);
      const ai_state = running.has(r.id) ? "running" : stale ? null : jobActive(job) ? "queued" : job ? "failed" : null;
      return { ...r, ai_running: ai_state === "running" || ai_state === "queued", ai_state, ai_review: reviews.get(r.id) ?? null, region: g?.region ?? null, region_pending: !g };
    }),
  });
}

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

  if (!(await reportsInScope(await scopeFor(g.user), ids as string[]))) {
    return NextResponse.json({ error: "Laporan di luar wilayah tugas Anda." }, { status: 403 });
  }

  await recordAiReview(ids as string[], status, g.user.full_name);

  const { data, error } = await db()
    .from("reports")
    .update({ status, reviewed_by: g.user.id, reviewed_at: new Date().toISOString() })
    .in("id", ids as string[])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await dropJobs(ids as string[]);
  return NextResponse.json({ updated: data?.length ?? 0 });
}
