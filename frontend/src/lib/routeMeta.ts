
export type SkeletonVariant = "stats" | "reports" | "table" | "form" | "map";
export type RouteMeta = { eyebrow?: string; title?: string; variant: SkeletonVariant };

const ROUTES: [prefix: string, meta: RouteMeta][] = [
  ["/support/status", { eyebrow: "Status Wilayah", title: "Status Wilayah", variant: "form" }],
  ["/support/notifications/new", { eyebrow: "Notifikasi", title: "Buat Notifikasi", variant: "form" }],
  ["/support/notifications", { eyebrow: "Notifikasi", title: "Riwayat Notifikasi", variant: "table" }],
  ["/support/reports", { eyebrow: "Konsol Support", title: "Laporan", variant: "reports" }],
  ["/support/map", { variant: "map" }],
  ["/support/users", { eyebrow: "Konsol Support", title: "Semua Pengguna", variant: "table" }],
  ["/admin/citizens", { eyebrow: "Admin Panel", title: "Pengguna (NIK)", variant: "table" }],
  ["/admin/users", { eyebrow: "Admin Panel", title: "Users", variant: "table" }],
  ["/admin/performance", { eyebrow: "Admin Panel", title: "Performa Support", variant: "stats" }],
  ["/admin/settings", { eyebrow: "Admin Panel", title: "Pengaturan", variant: "form" }],
  ["/admin", { eyebrow: "Admin Panel", title: "Ringkasan", variant: "stats" }],
];

export function routeMeta(path: string): RouteMeta {
  const p = path.split(/[?#]/)[0];
  return ROUTES.find(([prefix]) => p === prefix || p.startsWith(prefix + "/"))?.[1] ?? { variant: "table" };
}
