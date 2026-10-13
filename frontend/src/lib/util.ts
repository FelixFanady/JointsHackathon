export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function maskNik(nik: string | null): string {
  if (!nik) return "-";
  return `${nik.slice(0, 6)}••••••${nik.slice(-4)}`;
}

export const STATUS_LABEL = { pending: "Menunggu", valid: "Valid", false: "Palsu" } as const;
export const KIND_LABEL = { sos: "SOS", report: "Laporan" } as const;

/** Greedy distance clustering (haversine). Fine for a few thousand points. */
export type Cluster<T extends { lat: number; lng: number }> = { lat: number; lng: number; items: T[] };

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function clusterPoints<T extends { lat: number; lng: number }>(points: T[], radiusM: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  for (const p of points) {
    let hit: Cluster<T> | undefined;
    for (const c of clusters) {
      if (haversineM(c.lat, c.lng, p.lat, p.lng) <= radiusM) { hit = c; break; }
    }
    if (hit) {
      hit.items.push(p);
      const n = hit.items.length;
      hit.lat += (p.lat - hit.lat) / n;
      hit.lng += (p.lng - hit.lng) / n;
    } else {
      clusters.push({ lat: p.lat, lng: p.lng, items: [p] });
    }
  }
  return clusters;
}
