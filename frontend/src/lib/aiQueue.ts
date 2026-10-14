import "server-only";
import { db } from "./supabase";
import { autoTriage } from "./autoTriage";
import { verifyReports } from "./ai";
import { loadAiRunning } from "./aiRunning";

/**
 * AI work queue. Every new report gets an automatic AI check; when the free AI models are all
 * busy, the job waits here and is retried with back-off instead of being dropped, and officers see
 * "AI dalam antrean" meanwhile. Stored in `settings` as `ai_queue:<report id>` so it survives restarts.
 *
 * Jobs:
 *  - "triage": automatic check of a new report (lib/autoTriage.ts, may auto-validate + alert).
 *  - "verify": an officer's "Cek dengan AI" that hit a busy AI (just the AI verdict).
 */

const PREFIX = "ai_queue:";
const MAX_ATTEMPTS = 8;
const BACKOFF_S = [20, 40, 60, 120, 180, 300, 600]; // after attempt 1, 2, 3, ...
const SWEEP_HOURS = 6; // pending reports this recent without an AI verdict get (re)queued

export type QueueJob = { kind: "triage" | "verify"; ids?: string[]; at: string; attempts: number; next_at: string; failed?: boolean };

const keyFor = (id: string) => PREFIX + id;

export async function loadQueue(): Promise<Map<string, QueueJob>> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  const out = new Map<string, QueueJob>();
  for (const r of data ?? []) if (typeof r.key === "string") out.set(r.key.slice(PREFIX.length), r.value as QueueJob);
  return out;
}

/** Add a job (replaces a failed/finished one for the same report). */
export async function enqueue(reportId: string, kind: QueueJob["kind"] = "triage", ids?: string[]): Promise<void> {
  const now = new Date().toISOString();
  const job: QueueJob = { kind, ...(ids ? { ids } : {}), at: now, attempts: 0, next_at: now };
  await db().from("settings").upsert({ key: keyFor(reportId), value: job, updated_at: now }, { onConflict: "key" }).then(() => undefined, () => undefined);
}

/** An officer decided these reports: drop their pending automatic checks (the officer's decision wins). */
export async function dropJobs(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db().from("settings").delete().in("key", ids.map(keyFor)).then(() => undefined, () => undefined);
}

async function save(reportId: string, job: QueueJob) {
  await db().from("settings").upsert({ key: keyFor(reportId), value: job, updated_at: new Date().toISOString() }, { onConflict: "key" }).then(() => undefined, () => undefined);
}
async function remove(reportId: string) {
  await db().from("settings").delete().eq("key", keyFor(reportId)).then(() => undefined, () => undefined);
}

// ---- worker (one per server process) ----
let working = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

/** Process every due job, one at a time (free models are rate-limited). Safe to call often. */
export async function kickQueue(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (let guard = 0; guard < 50; guard++) {
      const [queue, running] = await Promise.all([loadQueue(), loadAiRunning()]);
      const now = Date.now();
      const due = [...queue.entries()]
        .filter(([id, j]) => !j.failed && Date.parse(j.next_at) <= now && !running.has(id))
        .sort((a, b) => Date.parse(a[1].at) - Date.parse(b[1].at));
      if (!due.length) {
        scheduleWake(queue);
        return;
      }
      const [id, job] = due[0];
      let outcome: "done" | "retry" | "skip";
      if (job.kind === "verify") {
        const res = await verifyReports(job.ids?.length ? job.ids : [id]);
        outcome = res.ok ? "done" : res.status >= 500 || res.status === 429 ? "retry" : "skip";
      } else {
        outcome = await autoTriage(id);
      }
      if (outcome !== "retry") {
        await remove(id);
      } else {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Give up: the report stays "pending" for an officer; the console shows that AI could not check it.
          await save(id, { ...job, attempts, failed: true });
        } else {
          const wait = BACKOFF_S[Math.min(attempts - 1, BACKOFF_S.length - 1)] * 1000;
          await save(id, { ...job, attempts, next_at: new Date(Date.now() + wait).toISOString() });
        }
      }
    }
  } catch {
    /* next kick retries */
  } finally {
    working = false;
  }
}

function scheduleWake(queue: Map<string, QueueJob>) {
  const next = [...queue.values()].filter((j) => !j.failed).map((j) => Date.parse(j.next_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  if (next === undefined) return;
  wakeTimer = setTimeout(() => { wakeTimer = null; void kickQueue(); }, Math.max(1000, next - Date.now() + 200));
}

/**
 * Safety net, called from the console's report polling: queue any recent pending report that never
 * got an AI verdict (e.g. the server restarted mid-check), then make sure the worker is running.
 */
export async function sweepAndKick(reports: { id: string; status: string; ai_verdict: unknown; created_at: string }[], queue: Map<string, QueueJob>, running: Set<string>) {
  if (!process.env.OPENROUTER_API_KEY) return;
  const cutoff = Date.now() - SWEEP_HOURS * 3600_000;
  const missing = reports.filter((r) => r.status === "pending" && !r.ai_verdict && Date.parse(r.created_at) >= cutoff && !queue.has(r.id) && !running.has(r.id));
  for (const r of missing.slice(0, 20)) await enqueue(r.id, "triage");
  void kickQueue();
}
