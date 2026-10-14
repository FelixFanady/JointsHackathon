import "server-only";
import { createSign } from "node:crypto";
import { db } from "./supabase";
import { open, seal, tryOpen } from "./crypto";

/**
 * Push delivery to the phones through Firebase Cloud Messaging (HTTP v1), so a notice reaches the
 * citizen even when the SiagaKu app is closed.
 *
 * Needs ONE server-side env var, FIREBASE_SERVICE_ACCOUNT: the service-account JSON downloaded from
 * Firebase console > Project settings > Service accounts (raw JSON, or base64 of it). Without it
 * every function here is a no-op, and the app keeps working through its in-app polling.
 *
 * Messages are DATA-ONLY (no "notification" block): the app builds the notification itself, so the
 * siren sound, vibration, level emoji and big photo stay identical to the polled ones.
 *
 * Tokens live in the existing `settings` table, one encrypted row per citizen: `push:<nik>`.
 * No new tables, same approach as citizenActivity.ts.
 */

export const BROADCAST_TOPIC = "siagaku_all";
const PREFIX = "push:";
const MAX_TOKENS_PER_CITIZEN = 3; // a citizen's few devices; oldest is dropped
const keyFor = (nik: string) => `${PREFIX}${nik}`;

type TokenRow = { tokens: { t: string; at: string }[] };
const TOKEN_RE = /^[A-Za-z0-9_:.\-]{50,4096}$/; // FCM registration tokens look like "id:APA91b..."

// ---------- token store ----------

async function load(nik: string): Promise<TokenRow> {
  const { data } = await db().from("settings").select("value").eq("key", keyFor(nik)).maybeSingle();
  const row = open<Partial<TokenRow>>(data?.value, keyFor(nik));
  return { tokens: Array.isArray(row.tokens) ? row.tokens : [] };
}

async function save(nik: string, row: TokenRow): Promise<void> {
  if (!row.tokens.length) {
    await db().from("settings").delete().eq("key", keyFor(nik));
    return;
  }
  await db().from("settings").upsert({ key: keyFor(nik), value: seal(row, keyFor(nik)), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export const validToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

/** Remember this phone for the citizen (idempotent). The same token is removed from every other citizen
 *  that holds it, so a shared/handed-over phone only ever receives the signed-in citizen's notices. */
export async function registerToken(nik: string, token: string): Promise<void> {
  await dropTokenEverywhere(token, nik);
  const row = await load(nik);
  const rest = row.tokens.filter((x) => x.t !== token);
  rest.push({ t: token, at: new Date().toISOString() });
  await save(nik, { tokens: rest.slice(-MAX_TOKENS_PER_CITIZEN) });
}

export async function unregisterToken(nik: string, token: string): Promise<void> {
  const row = await load(nik);
  const rest = row.tokens.filter((x) => x.t !== token);
  if (rest.length !== row.tokens.length) await save(nik, { tokens: rest });
}

async function dropTokenEverywhere(token: string, exceptNik: string): Promise<void> {
  const { data } = await db().from("settings").select("key,value").like("key", `${PREFIX}%`);
  for (const r of data ?? []) {
    if (typeof r.key !== "string" || r.key === keyFor(exceptNik)) continue;
    const row = tryOpen<TokenRow>(r.value, r.key);
    if (row?.tokens?.some((x) => x.t === token)) {
      await save(r.key.slice(PREFIX.length), { tokens: row.tokens.filter((x) => x.t !== token) });
    }
  }
}

async function tokensFor(niks: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < niks.length; i += 200) {
    const keys = niks.slice(i, i + 200).map(keyFor);
    const { data } = await db().from("settings").select("key,value").in("key", keys);
    for (const r of data ?? []) {
      const row = tryOpen<TokenRow>(r.value, r.key);
      if (row?.tokens?.length) out.set(r.key.slice(PREFIX.length), row.tokens.map((x) => x.t));
    }
  }
  return out;
}

// ---------- FCM HTTP v1 ----------

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let account: ServiceAccount | null | undefined;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  account = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(json);
    if (j.project_id && j.client_email && j.private_key) {
      account = { project_id: j.project_id, client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
    }
  } catch {
    /* malformed -> push disabled, polling still works */
  }
  return account;
}

export const pushConfigured = () => serviceAccount() !== null;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
let cachedAccess: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.exp - 60 > now) return cachedAccess.token;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(sig)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) throw new Error(`FCM auth failed (${res.status})`);
  cachedAccess = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** What the phone needs to build the notification itself. FCM data values must all be strings. */
export type PushPayload = {
  id: string; // the notice id: the app uses it so a notice is never shown twice (push + polling)
  to: string; // "all" or a NIK: the app ignores a push meant for someone else signed in earlier on the same phone
  title: string;
  message: string;
  level: string;
  kind: string;
  created_at: string;
  photo_url?: string | null;
  report_id?: string | null;
};

function toData(p: PushPayload): Record<string, string> {
  const d: Record<string, string> = {
    id: p.id,
    to: p.to,
    // FCM caps the whole message at 4 KB; keep the text well under it (the app can fetch the full text by polling).
    title: p.title.slice(0, 200),
    message: p.message.slice(0, 1800),
    level: p.level,
    kind: p.kind,
    created_at: p.created_at,
  };
  if (p.photo_url) d.photo_url = p.photo_url;
  if (p.report_id) d.report_id = p.report_id;
  return d;
}

/** Sends one message. Returns "gone" when FCM says the token is dead (app uninstalled), so the caller can forget it. */
async function sendOne(sa: ServiceAccount, auth: string, target: { token: string } | { topic: string }, data: Record<string, string>): Promise<"ok" | "gone" | "error"> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          ...target,
          data,
          // "high" wakes a sleeping/closed app (Doze) right away; 1 h time-to-live: an alert that old is stale.
          android: { priority: "high", ttl: "3600s" },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "ok";
    if (res.status === 404 || res.status === 410) return "gone";
    const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    if (j.error?.details?.some((d) => d.errorCode === "UNREGISTERED") || j.error?.status === "NOT_FOUND") return "gone";
    return "error";
  } catch {
    return "error";
  }
}

/**
 * Push a notice to the phones. `niks` are the targeted citizens; a broadcast goes to the topic every
 * signed-in app subscribes to. Best-effort: never throws, because the notice is already stored and the
 * app's polling still delivers it when the phone is awake.
 */
export async function pushNotice(payload: Omit<PushPayload, "to" | "id">, targets: { to: string; id: string }[]): Promise<{ sent: number; failed: number }> {
  const sa = serviceAccount();
  if (!sa || !targets.length) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  try {
    const auth = await accessToken(sa);
    const broadcast = targets.find((t) => t.to === "all");
    if (broadcast) {
      const r = await sendOne(sa, auth, { topic: BROADCAST_TOPIC }, toData({ ...payload, ...broadcast }));
      if (r === "ok") sent++;
      else failed++;
    }
    const niks = targets.filter((t) => t.to !== "all");
    const tokens = await tokensFor(niks.map((t) => t.to));
    const jobs: { nik: string; token: string; data: Record<string, string> }[] = [];
    for (const t of niks) for (const token of tokens.get(t.to) ?? []) jobs.push({ nik: t.to, token, data: toData({ ...payload, ...t }) });
    const dead: { nik: string; token: string }[] = [];
    // Small worker pool: a few hundred citizens must not open a few hundred sockets at once.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(15, jobs.length) }, async () => {
        for (;;) {
          const j = jobs[next++];
          if (!j) return;
          const r = await sendOne(sa, auth, { token: j.token }, j.data);
          if (r === "ok") sent++;
          else {
            failed++;
            if (r === "gone") dead.push({ nik: j.nik, token: j.token });
          }
        }
      }),
    );
    for (const d of dead) await unregisterToken(d.nik, d.token).catch(() => {});
  } catch {
    failed++;
  }
  return { sent, failed };
}
