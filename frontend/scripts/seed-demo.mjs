import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const names = ["Andi Pratama", "Siti Aminah", "Budi Hartono", "Dewi Lestari", "Rizky Fadhillah", "Maya Putri", "Agus Salim", "Nur Hidayah", "Joko Santoso", "Lina Marlina"];
const citizens = names.map((full_name, i) => ({ nik: `317101010190${String(i).padStart(4, "0")}`, full_name }));
await db.from("citizens").upsert(citizens, { onConflict: "nik" });

const hotspots = [
  { lat: -6.2096, lng: 106.8497, n: 22, label: "Manggarai", cats: ["Banjir", "Banjir", "Kabel Bahaya"] },
  { lat: -6.2297, lng: 106.8431, n: 9, label: "Tebet", cats: ["Banjir", "Jalan Rusak"] },
  { lat: -6.1754, lng: 106.8272, n: 5, label: "Monas", cats: ["Jambret", "Kecelakaan"] },
  { lat: -6.2615, lng: 106.8106, n: 2, label: "Pasar Minggu", cats: ["Kebakaran"] },
  { lat: -6.1214, lng: 106.7741, n: 1, label: "Ancol", cats: ["Pohon Tumbang"] },
];
const rows = [];
for (const h of hotspots) {
  for (let i = 0; i < h.n; i++) {
    const c = citizens[i % citizens.length];
    const sos = i % 3 === 0;
    rows.push({
      kind: sos ? "sos" : "report",
      nik: c.nik,
      reporter_name: c.full_name,
      category: sos ? h.cats[0] : h.cats[i % h.cats.length],
      description: sos ? null : `Laporan ${h.cats[i % h.cats.length].toLowerCase()} di sekitar ${h.label}. Mohon petugas segera mengecek lokasi.`,
      lat: h.lat + (Math.random() - 0.5) * 0.003,
      lng: h.lng + (Math.random() - 0.5) * 0.003,
      address: `Sekitar ${h.label}, Jakarta`,
      created_at: new Date(Date.now() - Math.random() * 3 * 3600_000).toISOString(),
    });
  }
}
const { error } = await db.from("reports").insert(rows);
if (error) { console.error(error.message); process.exit(1); }
console.log(`Inserted ${rows.length} demo reports.`);
