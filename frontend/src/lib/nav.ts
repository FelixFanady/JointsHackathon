import type { NavEntry, NavItem } from "@/components/Sidebar";
import type { Role } from "@/lib/types";

const STATUS_NAV: NavItem = { href: "/support/status", label: "Status Wilayah", icon: "crisis_alert" };

const NOTIFICATIONS_NAV: NavItem = {
  href: "/support/notifications",
  label: "Notifikasi",
  icon: "campaign",
  children: [
    { href: "/support/notifications/new", label: "Buat Notifikasi", icon: "send" },
    { href: "/support/notifications", label: "Riwayat Notifikasi", icon: "schedule" },
  ],
};

export const ADMIN_NAV: NavEntry[] = [
  { href: "/admin", label: "Ringkasan", icon: "grid_view" },

  { section: "Operasional" },
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
  STATUS_NAV,
  NOTIFICATIONS_NAV,

  { section: "Warga" },
  { href: "/admin/citizens", label: "Pengguna (NIK)", icon: "badge" },
  { href: "/support/users", label: "Pengguna & Daerah", icon: "groups" },

  { section: "Tim & Akses" },
  { href: "/admin/users", label: "Users", icon: "shield" },
  { href: "/admin/support", label: "Akun Support", icon: "support_agent" },
  { href: "/admin/performance", label: "Performa Support", icon: "monitoring" },

  { section: "Sistem" },
  { href: "/admin/settings", label: "Pengaturan", icon: "tune" },
];

export const SUPPORT_NAV: NavItem[] = [
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
  { href: "/support/users", label: "Semua Pengguna", icon: "groups" },
  STATUS_NAV,
  NOTIFICATIONS_NAV,
];

export function sidebarForSupport(role: Role): { title: string; items: NavEntry[] } {
  return role === "admin"
    ? { title: "Admin Panel", items: ADMIN_NAV }
    : { title: "Pusat Operasi", items: SUPPORT_NAV };
}
