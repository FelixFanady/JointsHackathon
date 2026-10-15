import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const [username, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ") || "Administrator";
if (!username || !password || password.length < 8) {
  console.error('Usage: npm run create-admin -- <username> <password (min 8)> "<Full Name>"');
  process.exit(1);
}
if (!/^[a-z0-9._-]{3,32}(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$/.test(username)) {
  console.error("Username must be 3-32 chars of a-z 0-9 . _ - (optionally followed by @domain)");
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await db.auth.admin.createUser({
  email: username.includes("@") ? username : `${username}@siagaku.internal`,
  password,
  email_confirm: true,
});
if (error) { console.error("Auth error:", error.message); process.exit(1); }

const { error: pErr } = await db.from("profiles").insert({
  id: data.user.id, username, full_name: fullName, role: "admin", unit: "Pusdalops",
});
if (pErr) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error("Profile error (did you run supabase/schema.sql?):", pErr.message);
  process.exit(1);
}
console.log(`Admin '${username}' created. Log in at http://127.0.0.1:3000/login`);
