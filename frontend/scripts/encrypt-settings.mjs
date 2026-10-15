import { readFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const dry = process.argv.includes("--dry-run");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATA_ENCRYPTION_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env missing");
const key = Buffer.from(DATA_ENCRYPTION_KEY ?? "", "base64");
if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY missing or not 32 bytes (base64)");

const seal = (value, aad) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(value ?? {}), "utf8"), c.final()]);
  return { enc: "v1", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
};
const open = (e, aad) => {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(e.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(e.ct, "base64")), d.final()]).toString("utf8"));
};
const isSealed = (v) => v && typeof v === "object" && v.enc === "v1" && typeof v.ct === "string";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stats = { found: 0, already: 0, migrated: 0, failed: 0 };

for (const prefix of ["citizen_profile:", "citizen_activity:"]) {
  const { data, error } = await db.from("settings").select("key,value").like("key", `${prefix}%`);
  if (error) throw error;
  for (const row of data ?? []) {
    stats.found++;
    if (isSealed(row.value)) { stats.already++; continue; }
    if (dry) { stats.migrated++; continue; }
    try {
      const { error: e1 } = await db.from("settings").upsert(
        { key: row.key, value: seal(row.value, row.key), updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (e1) throw e1;
      const { data: back, error: e2 } = await db.from("settings").select("value").eq("key", row.key).single();
      if (e2) throw e2;
      if (!isSealed(back.value) || !isDeepStrictEqual(open(back.value, row.key), row.value)) throw new Error("verify mismatch");
      stats.migrated++;
    } catch (err) {
      stats.failed++;
      console.error(`FAILED ${row.key.split(":")[0]}:***${row.key.slice(-4)} -> ${err.message}`);
      await db.from("settings").upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }
  }
}
console.log(dry ? "DRY RUN" : "DONE", stats);
if (stats.failed) process.exitCode = 1;
