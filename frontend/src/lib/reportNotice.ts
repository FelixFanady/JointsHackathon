import type { NoticeKind } from "./citizenNotice";


const DISASTER = ["tsunami", "gempa bumi", "banjir", "kebakaran", "longsor", "bencana lainnya"];
const CRIME = ["pencurian", "penjambretan", "perampokan"];

export function kindForCategory(category: string): NoticeKind {
  const c = category.trim().toLowerCase();
  if (DISASTER.includes(c)) return "bencana";
  if (CRIME.includes(c)) return "kriminal";
  return "umum";
}

export const NEARBY_RADIUS_OPTIONS_KM = [1, 3, 5, 10, 25] as const;
export const DEFAULT_RADIUS_KM = 5;
export const NOTICE_MESSAGE_MAX = 800;

type R = {
  category: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  region?: { village?: string | null; district?: string | null; city?: string | null; province?: string | null; label?: string } | null;
};

export function eventName(r: R): string {
  if (r.category === "Bencana Lainnya" && r.description?.trim()) return r.description.trim();
  return r.category;
}

function place(r: R): string {
  const g = r.region;
  if (g) {
    const parts = [g.village, g.district, g.city].filter((v): v is string => !!v?.trim());
    const uniq = parts.filter((v, i) => parts.indexOf(v) === i);
    if (uniq.length) return uniq.join(", ");
  }
  const a = r.address?.trim();
  if (a) return a.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ");
  return "lokasi laporan";
}

export type BmkgQuake = {
  waktu: string;
  magnitudo: number;
  kedalaman: string;
  wilayah: string;
  jarak_km: number;
  dirasakan?: string;
  potensi?: string;
};

export const QUAKE_CATEGORIES = ["Gempa Bumi", "Tsunami"];
const MAX_QUAKE_KM = 300;
const QUAKE_BEFORE_MS = 6 * 3600_000;
const QUAKE_AFTER_MS = 30 * 60_000;

export function matchQuake(quakes: BmkgQuake[], reportAt: string): BmkgQuake | null {
  const t = Date.parse(reportAt);
  const fits = quakes.filter((q) => {
    const qt = Date.parse(q.waktu);
    return Number.isFinite(qt) && qt >= t - QUAKE_BEFORE_MS && qt <= t + QUAKE_AFTER_MS && q.jarak_km <= MAX_QUAKE_KM;
  });
  return fits.sort((a, b) => a.jarak_km - b.jarak_km)[0] ?? null;
}

export const tsunamiPotential = (q: BmkgQuake) => !!q.potensi && /berpotensi/i.test(q.potensi) && !/tidak\s+berpotensi/i.test(q.potensi);

const wib = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return `${d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":")} WIB`;
};

const TIPS: [RegExp, string[]][] = [
  [/tsunami/i, ["Segera jauhi pantai, menuju tempat tinggi", "Jangan menunggu air laut surut", "Ikuti jalur evakuasi dan arahan BPBD"]],
  [/gempa/i, ["Tetap tenang, lindungi kepala", "Jauhi bangunan retak, kaca, dan tiang listrik", "Waspada gempa susulan"]],
  [/banjir/i, ["Matikan listrik, pindahkan barang ke tempat tinggi", "Jangan melintasi arus air", "Siapkan evakuasi ke tempat aman"]],
  [/kebakaran/i, ["Jauhi lokasi api dan asap", "Tutup hidung dengan kain basah", "Hubungi Damkar 113"]],
  [/longsor/i, ["Jauhi lereng dan tebing", "Waspada longsor susulan saat hujan", "Ikuti arahan evakuasi petugas"]],
  [/curi|jambret|rampok|kriminal/i, ["Hindari area tersebut untuk sementara", "Kunci rumah dan kendaraan", "Laporkan hal mencurigakan ke Polisi 110"]],
];
const tipsFor = (cat: string, kind: NoticeKind) =>
  TIPS.find(([re]) => re.test(cat))?.[1] ??
  (kind === "kriminal" ? TIPS[TIPS.length - 1][1] : ["Tetap tenang dan waspada", "Jauhi area berbahaya", "Ikuti arahan petugas"]);

export function defaultNoticeText(r: R, kind: NoticeKind, quake?: BmkgQuake | null, opts: { auto?: boolean } = {}): { title: string; message: string } {
  const ev = eventName(r);
  const q = quake && QUAKE_CATEGORIES.includes(r.category) ? quake : null;
  const title = (
    q ? `${tsunamiPotential(q) ? "PERINGATAN TSUNAMI" : `Gempa M${q.magnitudo.toFixed(1)}`} — ${place(r)}`
    : kind === "bencana" ? `Peringatan ${ev}`
    : kind === "kriminal" ? `Waspada ${ev}`
    : `Info ${ev}`
  ).slice(0, 80);

  const lines: string[] = [
    opts.auto
      ? `Laporan ${ev} di ${place(r)} dikonfirmasi otomatis oleh AI dan data BMKG.`
      : `Petugas telah memverifikasi laporan ${ev} di ${place(r)}.`,
  ];
  if (q) {
    lines.push(
      "",
      "Info BMKG:",
      `• Kekuatan: M${q.magnitudo.toFixed(1)}`,
      `• Kedalaman: ${q.kedalaman}`,
      `• Pusat gempa: ${q.wilayah} (±${q.jarak_km} km dari lokasi)`,
      `• Waktu: ${wib(q.waktu)}`,
      `• Tsunami: ${q.potensi?.trim() || "tidak ada keterangan dari BMKG"}`,
      ...(q.dirasakan ? [`• Dirasakan: ${q.dirasakan}`] : []),
    );
  } else if (QUAKE_CATEGORIES.includes(r.category)) {
    lines.push("", "Info BMKG: belum ada gempa tercatat yang cocok dengan laporan ini. Pantau info resmi BMKG.");
  }
  lines.push("", "Yang perlu dilakukan:", ...tipsFor(ev + " " + r.category, kind).map((t) => `• ${t}`));
  lines.push("", kind === "kriminal" ? "Darurat: 110 (Polisi) / 112" : "Darurat: 112");

  let message = lines.join("\n");
  if (message.length > NOTICE_MESSAGE_MAX) message = lines.filter((l) => !l.startsWith("• Dirasakan")).join("\n");
  return { title, message: message.slice(0, NOTICE_MESSAGE_MAX) };
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ReportNoticeLog = {
  sent_at: string;
  scope: "nearby" | "all";
  radius_km: number | null;
  recipients: number;
  kind: NoticeKind;
  title: string;
  by: string;
  auto?: boolean;
  note?: string;
};
