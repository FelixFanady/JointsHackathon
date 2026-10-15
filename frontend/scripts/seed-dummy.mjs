import { readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  CITIES, NAMES, PROVINCE_GROUPS, STREETS, CATEGORY_BASE, HAZARD_BOOST, DESCRIPTIONS, SPAM, OTHER_SOS, TIMES,
  IP_PREFIXES, STAFF_UA, CITIZEN_UA,
} from "./dummy/data.mjs";

try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
} catch {}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const num = (name, def, min, max) => {
  const v = Number(opt(name, def));
  if (!Number.isFinite(v) || v < min || v > max) {
    console.error(`--${name} harus angka ${min}-${max}.`);
    process.exit(1);
  }
  return Math.floor(v);
};

const CFG = {
  citizens: num("citizens", 2500, 10, 50000),
  reports: num("reports", 8000, 0, 200000),
  staff: num("staff", 40, 0, 300),
  days: num("days", 120, 3, 730),
  seed: num("seed", 20261015, 0, 2 ** 31),
  dry: flag("dry-run"),
  clean: flag("clean"),
  out: opt("out", null),
  password: opt("staff-password", null),
};

const MANIFEST_KEY = "seed_dummy:manifest";
const DAY = 86_400_000;
const MIN = 60_000;
const NOW = Date.now();
const iso = (t) => new Date(t).toISOString();

let state = CFG.seed >>> 0 || 1;
const rand = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const gauss = () => {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
function weighted(items, w) {
  const ws = items.map(w);
  let total = ws.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
const pad = (n, l = 2) => String(n).padStart(l, "0");
const shortCity = (c) => c.replace(/^(Kota|Kabupaten) /, "");
const fill = (tpl, ctx) =>
  tpl
    .replace(/\{s\}/g, ctx.street)
    .replace(/\{d\}/g, ctx.district)
    .replace(/\{t\}/g, pick(TIMES))
    .replace(/\{h\}/g, String(int(3, 15) * 10))
    .replace(/\{n\}/g, String(int(3, 40)))
    .replace(/\{rt\}/g, pad(int(1, 12), 3));

let encKey = null;
function seal(value, aad) {
  if (!encKey) {
    const raw = process.env.DATA_ENCRYPTION_KEY;
    const buf = raw ? Buffer.from(raw, "base64") : null;
    if (!buf || buf.length !== 32) {
      if (!CFG.dry) throw new Error("DATA_ENCRYPTION_KEY di .env.local tidak ada atau bukan base64 32 byte.");
      encKey = Buffer.alloc(32);
    } else encKey = buf;
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(JSON.stringify(value ?? {}), "utf8"), c.final()]);
  return { enc: "v1", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

const usedNames = new Set();
function makeName(group, female) {
  const g = NAMES[group];
  const firsts = female ? g.f : g.m;
  const lasts = female && g.lastF ? (group === "bali" || chance(0.7) ? g.lastF : g.last) : g.last;
  for (let i = 0; i < 80; i++) {
    const three = i > 30 || chance(0.3);
    let name;
    if (!three) name = `${pick(firsts)} ${pick(lasts)}`;
    else if (i > 55) {
      const a = pick(lasts);
      let b = pick(g.last);
      if (b === a) b = pick(g.last);
      name = `${pick(firsts)} ${a} ${b}`;
    } else {
      const f1 = pick(firsts);
      let f2 = pick(firsts);
      if (f2 === f1 || f2.includes(" ") || group === "bali") f2 = pick(g.last);
      name = `${f1} ${f2} ${pick(lasts)}`;
    }
    name = name.replace(/\s+/g, " ").trim();
    if (new Set(name.split(" ")).size !== name.split(" ").length) continue;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  let n = 2;
  const base = `${pick(firsts)} ${pick(lasts)}`;
  while (usedNames.has(`${base} ${pick(g.last)} ${n}`)) n++;
  const name = `${base} ${pick(g.last)} ${n}`;
  usedNames.add(name);
  return name;
}

const groupFor = (province) => weighted(PROVINCE_GROUPS[province] ?? [["jawa", 1]], (g) => g[1])[0];

const usedNik = new Set();
const nikSeq = new Map();
function makeNik(city, districtIdx, female, birth) {
  const dd = birth.getUTCDate() + (female ? 40 : 0);
  const prefix = `${city.pc}${city.cc}${pad(districtIdx + 1)}${pad(dd)}${pad(birth.getUTCMonth() + 1)}${pad(birth.getUTCFullYear() % 100)}`;
  let seq = nikSeq.get(prefix) ?? int(1, 40);
  let nik;
  do {
    seq++;
    nik = prefix + pad(seq, 4);
  } while (usedNik.has(nik));
  nikSeq.set(prefix, seq);
  usedNik.add(nik);
  return nik;
}

const PHONE_PREFIX = ["0811", "0812", "0813", "0821", "0822", "0852", "0853", "0814", "0815", "0816", "0856", "0857", "0858", "0817", "0818", "0819", "0859", "0877", "0878", "0881", "0882", "0895", "0896", "0897", "0898"];
const usedPhones = new Set();
function makePhone() {
  let p;
  do p = pick(PHONE_PREFIX) + String(int(1000000, 99999999)).padStart(int(7, 8), "0");
  while (usedPhones.has(p));
  usedPhones.add(p);
  return p;
}
const usedEmails = new Set();
function makeEmail(name, birth) {
  const parts = name.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").split(" ").filter(Boolean);
  const base = chance(0.5) ? `${parts[0]}.${parts[parts.length - 1]}` : `${parts[0]}${parts[parts.length - 1]}`;
  let e = `${base}${chance(0.6) ? birth.getUTCFullYear() % 100 : int(1, 999)}@${pick(["example.com", "example.org", "example.net"])}`;
  while (usedEmails.has(e)) e = `${base}${int(1000, 9999)}@example.com`;
  usedEmails.add(e);
  return e;
}

function makeIp(prefix) {
  const p = prefix ?? pick(IP_PREFIXES);
  const parts = p.split(".");
  while (parts.length < 4) parts.push(String(int(1, 254)));
  return parts.join(".");
}

const regionLabel = (district, city) => `${district}, ${city}`;
const cityPoint = (city, spread) => ({ lat: +(city.lat + gauss() * spread).toFixed(6), lng: +(city.lng + gauss() * spread).toFixed(6) });
const near = (p, spread) => ({ lat: +(p.lat + gauss() * spread).toFixed(6), lng: +(p.lng + gauss() * spread).toFixed(6) });
const recentBias = (days, power) => NOW - Math.pow(rand(), power) * days * DAY;

function generate() {
  const citizens = [];
  const byCity = new Map(CITIES.map((c) => [c.city, []]));
  for (let i = 0; i < CFG.citizens; i++) {
    const city = weighted(CITIES, (c) => c.weight);
    const group = groupFor(city.province);
    const female = chance(0.5);
    const birth = new Date(Date.UTC(int(1955, 2008), int(0, 11), int(1, 28)));
    const districtIdx = int(0, city.districts.length - 1);
    const district = city.districts[districtIdx];
    const full_name = makeName(group, female);
    const nik = makeNik(city, districtIdx, female, birth);
    const created = chance(0.75) ? NOW - (CFG.days + rand() * 240) * DAY : recentBias(CFG.days, 1.2);
    const street = pick(STREETS);
    const home = cityPoint(city, 0.022);
    const c = {
      nik, full_name, female, birth, city, district, districtIdx, street, home,
      active: !chance(0.03),
      created_at: created,
      phone: makePhone(),
      email: chance(0.45) ? makeEmail(full_name, birth) : null,
      ip: pick(IP_PREFIXES),
    };
    citizens.push(c);
    byCity.get(city.city).push(c);
  }

  const staff = [];
  const usedUsernames = new Set();
  const provWeight = new Map();
  for (const c of CITIES) provWeight.set(c.province, (provWeight.get(c.province) ?? 0) + c.weight);
  const provinces = [...provWeight.keys()].sort((a, b) => provWeight.get(b) - provWeight.get(a));
  for (let i = 0; i < CFG.staff; i++) {
    const all = i < 2;
    const primary = all ? null : i - 2 < provinces.length ? provinces[i - 2] : weighted(provinces, (p) => provWeight.get(p));
    const areas = all ? ["ALL"] : [primary];
    if (!all && chance(0.3)) {
      const extra = pick(provinces);
      if (extra !== primary) areas.push(extra);
    }
    const female = chance(0.45);
    const full_name = makeName(primary ? groupFor(primary) : "jawa", female);
    const parts = full_name.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(Boolean);
    let username = `demo.${parts[0]}.${parts[parts.length - 1]}`.slice(0, 32);
    for (let n = 2; usedUsernames.has(username); n++) username = `${username.slice(0, 29)}${n}`;
    usedUsernames.add(username);
    const homeCity = primary ? weighted(CITIES.filter((c) => c.province === primary), (c) => c.weight) : CITIES.find((c) => c.city === "Jakarta Pusat");
    const unit = all
      ? pick(["Pusdalops BNPB", "Pusat Pengendalian Operasi Nasional"])
      : pick([`BPBD Provinsi ${primary}`, `Pusdalops BPBD ${shortCity(homeCity.city)}`, `BPBD ${homeCity.city}`, `Posko Siaga ${shortCity(homeCity.city)}`]);
    staff.push({
      id: null, username, full_name, unit, areas, homeCity,
      active: i % 17 !== 16,
      created_at: NOW - (CFG.days + rand() * 60) * DAY,
      speed: 0.4 + rand() * 1.8,
      ip: pick(IP_PREFIXES),
    });
  }

  const reviewersFor = (province) => {
    const own = staff.filter((s) => s.active && (s.areas.includes("ALL") || s.areas.includes(province)));
    return own.length ? own : staff.filter((s) => s.active);
  };

  const reports = [];
  const cityByName = new Map(CITIES.map((c) => [c.city, c]));
  const catWeight = (city, cat) => {
    let w = CATEGORY_BASE[cat] ?? 1;
    for (const h of city.hazards) w *= HAZARD_BOOST[h]?.[cat] ?? 1;
    return w;
  };
  const reporterFor = (city, t) => {
    const local = byCity.get(city.city).filter((c) => c.created_at < t);
    if (local.length && chance(0.92)) return local[Math.floor(rand() * local.length)];
    const prov = citizens.filter((c) => c.city.province === city.province && c.created_at < t);
    if (prov.length) return pick(prov);
    const any = citizens.filter((c) => c.created_at < t);
    return any.length ? pick(any) : pick(citizens);
  };

  const verdictFor = (status, spam, cat, district) => {
    const v = spam ? "invalid" : status === "valid"
      ? weighted(["valid", "uncertain", "invalid"], (x) => ({ valid: 78, uncertain: 18, invalid: 4 })[x])
      : status === "false"
        ? weighted(["valid", "uncertain", "invalid"], (x) => ({ valid: 5, uncertain: 30, invalid: 65 })[x])
        : weighted(["valid", "uncertain", "invalid"], (x) => ({ valid: 55, uncertain: 35, invalid: 10 })[x]);
    const confidence = v === "valid" ? int(70, 97) : v === "uncertain" ? int(40, 65) : int(60, 95);
    const c = cat.toLowerCase();
    const summary = {
      valid: `Laporan ${c} di ${district} konsisten dengan laporan lain di sekitar lokasi dan waktu kejadian.`,
      uncertain: `Belum cukup informasi untuk memastikan ${c} di ${district}. Perlu konfirmasi petugas lapangan.`,
      invalid: spam ? "Isi laporan tidak menggambarkan kejadian darurat apa pun." : `Tidak ditemukan indikasi ${c} lain di sekitar ${district} pada waktu tersebut.`,
    }[v];
    const reasons = {
      valid: ["Lokasi berada di wilayah rawan kategori ini", "Ada laporan serupa dalam radius dekat", "Deskripsi spesifik dan masuk akal"],
      uncertain: ["Belum ada laporan pembanding di sekitar lokasi", "Deskripsi cukup umum"],
      invalid: spam ? ["Deskripsi berisi teks uji coba", "Tidak ada detail kejadian"] : ["Tidak ada laporan pendukung", "Tidak sesuai data BMKG terbaru"],
    }[v].filter(() => chance(0.85));
    const action = /banjir|longsor|tsunami|gempa/i.test(cat)
      ? "Koordinasikan tim BPBD terdekat dan siapkan jalur evakuasi."
      : /kebakaran/i.test(cat)
        ? "Hubungi Damkar setempat dan pastikan warga menjauh dari lokasi."
        : /pencurian|penjambretan|perampokan/i.test(cat)
          ? "Teruskan ke Polsek terdekat dan minta rekaman CCTV sekitar lokasi."
          : "Verifikasi ke perangkat RT/RW setempat.";
    return { verdict: v, confidence, summary, reasons: reasons.length ? reasons : ["Analisis otomatis"], recommended_action: action };
  };

  function makeReport({ city, t, cat, kind, point, forceStatus, district: forcedDistrict }) {
    const reporter = reporterFor(city, t);
    const local = reporter.city === city && !point && chance(0.7);
    const p = point ? near(point, 0.0018) : local ? near(reporter.home, 0.006) : cityPoint(city, 0.028);
    const district = forcedDistrict ?? (local ? reporter.district : pick(city.districts));
    const street = local ? reporter.street : pick(STREETS);
    const age = NOW - t;
    let status = forceStatus;
    if (!status) {
      const pendingP = age < 6 * 3600_000 ? 0.75 : age < DAY ? 0.4 : age < 3 * DAY ? 0.12 : 0.03;
      if (chance(pendingP)) status = "pending";
      else status = chance(kind === "sos" ? 0.12 : 0.18) ? "false" : "valid";
    }
    const spam = status === "false" && kind === "report" && chance(0.35);
    const category = spam ? pick(Object.keys(CATEGORY_BASE)) : cat;
    let description = null;
    if (kind === "report") {
      description = spam ? pick(SPAM) : fill(pick(DESCRIPTIONS[category] ?? DESCRIPTIONS["Bencana Lainnya"]), { street, district });
      if (!spam && !/Pencurian|Penjambretan|Perampokan/.test(category) && chance(0.25)) description = `[Membahayakan warga] ${description}`;
    } else if (category === "Bencana Lainnya") description = pick(OTHER_SOS);
    let reviewed_by = null;
    let reviewed_at = null;
    if (status !== "pending") {
      const pool = reviewersFor(city.province);
      const s = pool.length ? weighted(pool, (x) => x.speed) : null;
      const delay = Math.min(2 * DAY, Math.exp(3 + gauss() * 0.9) * MIN / (s?.speed ?? 1));
      if (t + delay < NOW - MIN) {
        reviewed_by = s;
        reviewed_at = t + delay;
      } else status = "pending";
    }
    const address = chance(0.85) ? `${street} No. ${int(1, 250)}, ${district}, ${city.city}` : null;
    reports.push({
      id: randomUUID(), kind, reporter, category, description,
      lat: p.lat, lng: p.lng, address, status, reviewed_by, reviewed_at,
      ai_verdict: verdictFor(status, spam, category, district),
      ai_checked_at: Math.min(NOW, t + int(20, 140) * 1000),
      created_at: t, city, district,
    });
  }

  const clusters = [
    { city: "Jakarta Timur", district: "Kramat Jati", cat: "Banjir", n: 22, within: 50 * MIN, ago: 0 },
    { city: "Kota Palu", district: "Palu Barat", cat: "Gempa Bumi", n: 17, within: 35 * MIN, ago: 5 * MIN },
    { city: "Kota Bandung", district: "Antapani", cat: "Kebakaran", n: 9, within: 40 * MIN, ago: 20 * MIN },
    { city: "Kota Samarinda", district: "Samarinda Ilir", cat: "Banjir", n: 26, within: 90 * MIN, ago: 9 * DAY, status: "valid" },
    { city: "Kabupaten Cianjur", district: "Cugenang", cat: "Gempa Bumi", n: 32, within: 60 * MIN, ago: 41 * DAY, status: "valid" },
    { city: "Kota Semarang", district: "Genuk", cat: "Banjir", n: 18, within: 80 * MIN, ago: 23 * DAY, status: "valid" },
  ].filter((c) => c.ago < CFG.days * DAY);
  const clusterTotal = clusters.reduce((a, c) => a + c.n, 0);
  if (CFG.reports >= clusterTotal * 3) {
    for (const cl of clusters) {
      const city = cityByName.get(cl.city);
      const center = cityPoint(city, 0.01);
      for (let i = 0; i < cl.n; i++) {
        const t = NOW - cl.ago - rand() * cl.within;
        makeReport({ city, t, cat: cl.cat, kind: chance(0.45) ? "sos" : "report", point: center, forceStatus: cl.status ?? "pending", district: cl.district });
      }
    }
  }
  const SOS_CATS = [...Object.keys(CATEGORY_BASE), "Darurat"];
  while (reports.length < CFG.reports) {
    const city = weighted(CITIES, (c) => c.weight);
    const kind = chance(0.28) ? "sos" : "report";
    const cats = kind === "sos" ? SOS_CATS : Object.keys(CATEGORY_BASE);
    const cat = weighted(cats, (k) => (k === "Darurat" ? 0.9 : catWeight(city, k)));
    let t = recentBias(CFG.days, 1.7);
    const d = new Date(t);
    const hour = d.getUTCHours() + 7;
    if (hour % 24 < 5 && chance(0.6)) t -= int(5, 9) * 3600_000;
    if (t > NOW - MIN) t = NOW - int(1, 30) * MIN;
    makeReport({ city, t, cat, kind });
  }

  const logs = [];
  const bogus = new Set();
  const lastLogin = new Map();
  for (const c of citizens) {
    const span = NOW - c.created_at;
    const sessions = c.active ? Math.max(0, Math.round(1 + rand() * 6 * Math.min(1, span / (60 * DAY)))) : int(0, 2);
    const ua = pick(CITIZEN_UA);
    const times = [];
    for (let i = 0; i < sessions; i++) times.push(c.created_at + Math.pow(rand(), 0.6) * span);
    times.sort((a, b) => a - b);
    for (const t of times) {
      const ip = chance(0.85) ? makeIp(c.ip) : makeIp();
      const region = `${shortCity(c.city.city)}, ${c.city.province}`;
      const base = { kind: "citizen", subject: c.nik, _c: c, display_name: c.full_name, role: null, ip, region, country: "ID", user_agent: ua };
      if (!c.active && chance(0.6)) {
        logs.push({ ...base, method: "nik", success: false, reason: "inactive", created_at: t });
        continue;
      }
      logs.push({ ...base, method: "nik", success: true, reason: null, created_at: t });
      if (chance(0.06)) logs.push({ ...base, method: "face_enroll", success: false, reason: pick(["no_face", "too_dark", "blurry", "face_too_small", "face_cut_off"]), created_at: t + int(20, 90) * 1000 });
      lastLogin.set(c, t);
    }
  }
  const failCount = Math.round(CFG.citizens * 0.08);
  for (let i = 0; i < failCount; i++) {
    const city = weighted(CITIES, (x) => x.weight);
    const typo = chance(0.7);
    let subject = typo ? `${city.pc}${city.cc}${pad(int(1, 9))}${pad(int(1, 71))}${pad(int(1, 12))}${pad(int(60, 99))}${pad(int(1, 9999), 4)}` : String(int(10000000, 999999999999999));
    if (usedNik.has(subject)) continue;
    bogus.add(subject);
    logs.push({
      kind: "citizen", subject, display_name: null, role: null, method: "nik", success: false,
      reason: subject.length === 16 ? "nik_not_found" : "invalid_nik",
      ip: makeIp(), region: `${shortCity(city.city)}, ${city.province}`, country: "ID", user_agent: pick(CITIZEN_UA),
      created_at: recentBias(CFG.days, 1.3),
    });
  }
  for (const s of staff) {
    const ua = pick(STAFF_UA);
    const sessions = int(12, 70);
    for (let i = 0; i < sessions; i++) {
      const day = Math.pow(rand(), 1.1) * Math.min(CFG.days, (NOW - s.created_at) / DAY);
      const t = NOW - day * DAY - int(0, 10) * 3600_000;
      if (t < s.created_at || t > NOW) continue;
      const ip = chance(0.8) ? makeIp(s.ip) : makeIp();
      const base = { kind: "staff", subject: s.username, display_name: s.full_name, role: "support", ip, region: `${shortCity(s.homeCity.city)}, ${s.homeCity.province}`, country: "ID", user_agent: chance(0.85) ? ua : pick(STAFF_UA) };
      if (chance(0.1)) logs.push({ ...base, display_name: null, role: null, method: "password", success: false, reason: "wrong_credentials", created_at: t - int(10, 120) * 1000 });
      if (!s.active && t > NOW - 10 * DAY) logs.push({ ...base, method: "password", success: false, reason: "inactive", created_at: t });
      else logs.push({ ...base, method: "password", success: true, reason: null, created_at: t });
    }
  }
  const probes = ["admin", "root", "test", "administrator", "support", "operator", "user", "demo"];
  for (let i = 0; i < Math.max(10, CFG.staff); i++) {
    const subject = pick(probes);
    bogus.add(subject);
    logs.push({
      kind: "staff", subject, display_name: null, role: null, method: "password", success: false,
      reason: chance(0.85) ? "wrong_credentials" : "invalid_input",
      ip: makeIp(pick(["45.148", "185.220", "103.152", "194.26", "91.92"])), region: null, country: pick([null, "US", "NL", "SG", "RU", "ID"]),
      user_agent: pick(["python-requests/2.32.3", "curl/8.5.0", STAFF_UA[0]]),
      created_at: recentBias(CFG.days, 1),
    });
  }
  logs.sort((a, b) => a.created_at - b.created_at);
  return { citizens, staff, reports, logs, lastLogin, bogus: [...bogus] };
}

function citizenProfile(c) {
  const address = `${c.street} No. ${int(1, 250)}, RT ${pad(int(1, 12), 3)}/RW ${pad(int(1, 9), 3)}, Kec. ${c.district}, ${c.city.city}, ${c.city.province}`;
  const at = iso(c.created_at + 5 * MIN);
  return {
    phone: c.phone,
    email: c.email,
    birth_date: c.birth.toISOString().slice(0, 10),
    address,
    geo: { province: c.city.province, city: c.city.city, district: c.district, village: null, label: regionLabel(c.district, c.city.city), lat: c.home.lat, lng: c.home.lng, source: "address", at, query: address },
  };
}

function citizenActivity(c, last, reports) {
  const mine = reports.filter((r) => r.reporter === c);
  const lastReport = mine.length ? mine[mine.length - 1] : null;
  const when = Math.max(last ?? 0, lastReport?.created_at ?? 0);
  if (!when) return null;
  const pos = lastReport && lastReport.created_at >= (last ?? 0) ? { lat: lastReport.lat, lng: lastReport.lng } : near(c.home, 0.004);
  const city = lastReport && lastReport.created_at >= (last ?? 0) ? lastReport.city : c.city;
  const district = lastReport && lastReport.created_at >= (last ?? 0) ? lastReport.district : c.district;
  const at = iso(when);
  return {
    last_login: at,
    last_lat: pos.lat,
    last_lng: pos.lng,
    last_seen_at: at,
    notices_fetched_at: at,
    region: { province: city.province, city: city.city, district, village: null, label: regionLabel(district, city.city), lat: pos.lat, lng: pos.lng, source: "gps", at },
  };
}

function stats({ citizens, staff, reports, logs }) {
  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const top = (o, n = 12) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
  return {
    citizens: citizens.length,
    unique_names: new Set(citizens.map((c) => c.full_name)).size,
    unique_niks: new Set(citizens.map((c) => c.nik)).size,
    provinces: new Set(citizens.map((c) => c.city.province)).size,
    cities: new Set(citizens.map((c) => c.city.city)).size,
    staff: staff.length,
    reports: reports.length,
    report_status: count(reports, (r) => r.status),
    report_kind: count(reports, (r) => r.kind),
    report_category: top(count(reports, (r) => r.category)),
    reports_last_24h: reports.filter((r) => r.created_at > NOW - DAY).length,
    top_province: top(count(reports, (r) => r.city.province), 8),
    login_logs: logs.length,
    login_logs_by_kind: count(logs, (l) => `${l.kind}:${l.success ? "valid" : "false"}`),
  };
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada di .env.local.");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function must(label, p) {
  const { error, data } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function insertAll(db, table, rows, size, label, opts) {
  let done = 0;
  for (const part of chunk(rows, size)) {
    await must(label, opts?.upsert ? db.from(table).upsert(part, { onConflict: opts.upsert }) : db.from(table).insert(part));
    done += part.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  if (rows.length) process.stdout.write("\n");
}

async function clean(db) {
  const row = await must("baca manifest", db.from("settings").select("value").eq("key", MANIFEST_KEY).maybeSingle());
  if (!row) {
    console.log("Tidak ada data dummy (manifest seed_dummy:manifest tidak ditemukan).");
    return;
  }
  const { niks = [], staff_ids = [], log_ids = [] } = row.value ?? {};
  console.log(`Menghapus data dummy: ${niks.length} warga, ${staff_ids.length} staf...`);
  let reportCount = 0;
  for (const part of chunk(niks, 150)) {
    const ids = [];
    for (let from = 0; ; from += 1000) {
      const data = await must("cari laporan", db.from("reports").select("id").in("nik", part).range(from, from + 999));
      ids.push(...data.map((r) => r.id));
      if (data.length < 1000) break;
    }
    for (const ip of chunk(ids, 100)) {
      await must("hapus region laporan", db.from("settings").delete().in("key", ip.flatMap((id) => [`report_region:${id}`, `ai_review:${id}`, `ai_queue:${id}`, `ai_running:${id}`])));
      await must("hapus laporan", db.from("reports").delete().in("id", ip));
    }
    reportCount += ids.length;
    await must("hapus data warga", db.from("settings").delete().in("key", part.flatMap((n) => [`citizen_profile:${n}`, `citizen_activity:${n}`, `face_guard:${n}`, `push:${n}`])));
    await must("hapus warga", db.from("citizens").delete().in("nik", part));
    process.stdout.write(`\r  laporan terhapus: ${reportCount}`);
  }
  process.stdout.write("\n");
  for (const part of chunk(log_ids, 300)) {
    await must("hapus login log", db.from("login_logs").delete().in("id", part));
  }
  for (const id of staff_ids) {
    await db.from("settings").delete().in("key", [`support_area:${id}`, `staff_face:${id}`]);
    const { error } = await db.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) console.error(`  gagal hapus staf ${id}: ${error.message}`);
  }
  await must("hapus manifest", db.from("settings").delete().eq("key", MANIFEST_KEY));
  console.log(`Selesai. ${niks.length} warga, ${reportCount} laporan, ${staff_ids.length} staf dihapus.`);
}

async function seed(db, data) {
  const existing = await must("cek manifest", db.from("settings").select("key").eq("key", MANIFEST_KEY).maybeSingle());
  if (existing) {
    console.error("Data dummy sudah pernah di-inject. Jalankan `npm run seed-dummy -- --clean` dulu kalau mau mengulang.");
    process.exit(1);
  }
  const { citizens, staff, reports, logs, lastLogin } = data;

  for (const part of chunk(citizens.map((c) => c.nik), 200)) {
    const hit = await must("cek NIK bentrok", db.from("citizens").select("nik").in("nik", part));
    if (hit.length) {
      const taken = new Set(hit.map((h) => h.nik));
      for (const c of citizens) if (taken.has(c.nik)) {
        const old = c.nik;
        c.nik = makeNik(c.city, c.districtIdx, c.female, c.birth);
        console.log(`  NIK ${old} sudah dipakai data asli, diganti ${c.nik}`);
      }
    }
  }

  const manifest = { created_at: iso(NOW), seed: CFG.seed, niks: citizens.map((c) => c.nik), staff_ids: [], log_ids: [] };
  const saveManifest = () => must("simpan manifest", db.from("settings").upsert({ key: MANIFEST_KEY, value: manifest, updated_at: iso(Date.now()) }, { onConflict: "key" }));
  await saveManifest();

  const password = CFG.password ?? `Demo-${randomBytes(9).toString("base64url")}`;
  if (staff.length) {
    if (password.length < 8) throw new Error("--staff-password minimal 8 karakter.");
    for (const [i, s] of staff.entries()) {
      const { data: u, error } = await db.auth.admin.createUser({ email: `${s.username}@siagaku.internal`, password, email_confirm: true });
      if (error || !u?.user) throw new Error(`buat akun ${s.username}: ${error?.message ?? "gagal"}`);
      s.id = u.user.id;
      manifest.staff_ids.push(s.id);
      const { error: pErr } = await db.from("profiles").insert({ id: s.id, username: s.username, full_name: s.full_name, role: "support", unit: s.unit, active: s.active, created_at: iso(s.created_at) });
      if (pErr) {
        await saveManifest();
        throw new Error(`profil ${s.username}: ${pErr.message}`);
      }
      await must("wilayah staf", db.from("settings").upsert({ key: `support_area:${s.id}`, value: { areas: s.areas }, updated_at: iso(s.created_at) }, { onConflict: "key" }));
      process.stdout.write(`\r  staf: ${i + 1}/${staff.length}`);
    }
    process.stdout.write("\n");
    await saveManifest();
  }

  await insertAll(db, "citizens", citizens.map((c) => ({ nik: c.nik, full_name: c.full_name, active: c.active, created_at: iso(c.created_at) })), 500, "warga");

  const reportsByCitizen = new Map();
  for (const r of reports) {
    if (!reportsByCitizen.has(r.reporter)) reportsByCitizen.set(r.reporter, []);
    reportsByCitizen.get(r.reporter).push(r);
  }
  const settingsRows = [];
  for (const c of citizens) {
    const pk = `citizen_profile:${c.nik}`;
    settingsRows.push({ key: pk, value: seal(citizenProfile(c), pk), updated_at: iso(c.created_at + 5 * MIN) });
    const act = citizenActivity(c, lastLogin.get(c), (reportsByCitizen.get(c) ?? []).sort((a, b) => a.created_at - b.created_at));
    if (act) {
      const ak = `citizen_activity:${c.nik}`;
      settingsRows.push({ key: ak, value: seal(act, ak), updated_at: act.last_login });
    }
  }
  await insertAll(db, "settings", settingsRows, 500, "profil & aktivitas warga", { upsert: "key" });

  await insertAll(db, "reports", reports.map((r) => ({
    id: r.id, kind: r.kind, nik: r.reporter.nik, reporter_name: r.reporter.full_name, category: r.category, description: r.description,
    photo_url: null, lat: r.lat, lng: r.lng, address: r.address, status: r.status,
    reviewed_by: r.reviewed_by?.id ?? null, reviewed_at: r.reviewed_at ? iso(r.reviewed_at) : null,
    ai_verdict: r.ai_verdict, ai_checked_at: iso(r.ai_checked_at), created_at: iso(r.created_at),
  })), 500, "laporan");

  await insertAll(db, "settings", reports.map((r) => ({
    key: `report_region:${r.id}`,
    value: {
      region: { province: r.city.province, city: r.city.city, district: r.district, village: null, label: regionLabel(r.district, r.city.city) },
      address: r.address ?? `${r.district}, ${r.city.city}, ${r.city.province}`,
      at: iso(r.created_at + MIN),
    },
    updated_at: iso(r.created_at + MIN),
  })), 500, "wilayah laporan", { upsert: "key" });

  const { error: logErr } = await db.from("login_logs").select("id", { head: true, count: "exact" }).limit(1);
  if (logErr) console.log("  login_logs dilewati: tabel belum ada. Jalankan supabase/login_logs.sql lalu ulangi dengan --clean.");
  else {
    const rows = logs.map(({ _c, ...l }) => ({ ...l, subject: _c ? _c.nik : l.subject, created_at: iso(l.created_at) }));
    let done = 0;
    for (const part of chunk(rows, 1000)) {
      const ids = await must("login logs", db.from("login_logs").insert(part).select("id"));
      manifest.log_ids.push(...ids.map((r) => r.id));
      done += part.length;
      process.stdout.write(`\r  login logs: ${done}/${rows.length}`);
    }
    process.stdout.write("\n");
    await saveManifest();
  }

  return password;
}

const t0 = Date.now();
if (CFG.clean) {
  await clean(client());
  process.exit(0);
}
const data = generate();
const s = stats(data);
console.log(JSON.stringify(s, null, 2));
if (CFG.out) {
  const sample = {
    citizens: data.citizens.slice(0, 20).map((c) => ({ nik: c.nik, full_name: c.full_name, city: c.city.city, province: c.city.province, profile: citizenProfile(c) })),
    staff: data.staff.slice(0, 10).map((x) => ({ username: x.username, full_name: x.full_name, unit: x.unit, areas: x.areas, active: x.active })),
    reports: data.reports.slice(0, 20).map((r) => ({ ...r, reporter: r.reporter.full_name, reviewed_by: r.reviewed_by?.username ?? null, city: r.city.city, created_at: iso(r.created_at) })),
    logs: data.logs.slice(-20).map(({ _c, ...l }) => ({ ...l, created_at: iso(l.created_at) })),
  };
  writeFileSync(CFG.out, JSON.stringify({ stats: s, sample }, null, 2));
  console.log(`Contoh data ditulis ke ${CFG.out}`);
}
if (CFG.dry) {
  console.log(`Dry run: tidak ada yang ditulis ke database (${Date.now() - t0} ms).`);
  process.exit(0);
}
const password = await seed(client(), data);
console.log(`\nSelesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik.`);
if (data.staff.length) console.log(`Password semua akun staf demo (username diawali "demo."): ${password}`);
console.log("Hapus semua data dummy: npm run seed-dummy -- --clean");
