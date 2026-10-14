import "server-only";
import { sendReportNotice } from "./reportNoticeServer";

/**
 * Instant crime alert: for street crimes where minutes matter (penjambretan), citizens near the
 * reported spot are warned right away, WITHOUT waiting for an officer. The alert says plainly that
 * the report is not verified yet, and carries the reporter's photo when there is one.
 * Logged on the report like any other alert (settings `report_notice:<id>`, auto = true).
 */

/** Categories that alert nearby citizens immediately. Add e.g. "Perampokan" here to extend it. */
export const INSTANT_ALERT_CATEGORIES = ["Penjambretan"];
export const INSTANT_ALERT_RADIUS_KM = 2;
export const INSTANT_ALERT_SENDER = "SiagaKu (peringatan otomatis)";

export const isInstantAlert = (category: string) => INSTANT_ALERT_CATEGORIES.includes(category);

function wibTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d).replace(".", ":") + " WIB";
}

export async function instantCrimeAlert(r: {
  id: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  photo_url: string | null;
  nik: string | null;
  created_at?: string;
}): Promise<void> {
  if (!isInstantAlert(r.category)) return;
  const what = r.category.toLowerCase();
  const lines = [
    `Warga melaporkan ${what} di dekat lokasi Anda, sekitar pukul ${wibTime(r.created_at ? new Date(r.created_at) : new Date())}.`,
    r.address ? `Lokasi: ${r.address.slice(0, 160)}` : null,
    "Laporan ini belum diverifikasi petugas.",
    "",
    "• Simpan HP dan tas di sisi yang jauh dari jalan.",
    "• Waspadai pengendara motor yang mendekat, hindari jalan sepi.",
    "• Jangan mengejar pelaku. Dalam bahaya, hubungi 110.",
  ].filter((l): l is string => l !== null);

  const res = await sendReportNotice(
    { id: r.id, lat: r.lat, lng: r.lng },
    {
      scope: "nearby",
      radiusKm: INSTANT_ALERT_RADIUS_KM,
      kind: "kriminal",
      level: "danger",
      title: `Waspada ${what} di sekitar Anda`.slice(0, 80),
      message: lines.join("\n"),
      by: INSTANT_ALERT_SENDER,
      auto: true,
      note: `Peringatan langsung (belum diverifikasi): ${r.category}`,
      photo_url: r.photo_url,
      excludeNik: r.nik,
    },
  );
  if (!res.ok && res.status === 500) console.error(`[instant-alert] report ${r.id}: ${res.error}`);
}
