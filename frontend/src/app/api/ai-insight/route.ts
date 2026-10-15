import { NextResponse, after } from "next/server";
import { guard } from "@/lib/session";
import { verifyReports } from "@/lib/ai";
import { loadAiRunning } from "@/lib/aiRunning";
import { enqueue, jobActive, kickQueue, loadQueue } from "@/lib/aiQueue";
import { reportsInScope } from "@/lib/reportRegion";
import { scopeFor } from "@/lib/supportArea";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const g = await guard(["admin", "support"]);
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 60 || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const list = ids as string[];

  const [running, queue] = await Promise.all([loadAiRunning(), loadQueue()]);
  if (list.some((id) => running.has(id) || jobActive(queue.get(id)))) {
    after(() => kickQueue());
    return NextResponse.json({ error: "AI sedang memeriksa laporan ini. Hasilnya akan muncul otomatis.", running: true }, { status: 409 });
  }
  if (!(await reportsInScope(await scopeFor(g.user), list))) {
    return NextResponse.json({ error: "Laporan di luar wilayah tugas Anda." }, { status: 403 });
  }

  const res = await verifyReports(list);
  if (res.ok) return NextResponse.json({ verdict: res.value.verdict });
  if (res.status === 429 || (res.status >= 500 && res.status !== 503)) {
    await enqueue(list[0], "verify", list);
    after(() => kickQueue());
    return NextResponse.json({ queued: true, running: true }, { status: 202 });
  }
  return NextResponse.json({ error: res.error }, { status: res.status });
}
