import type { NavItem } from "@/components/Sidebar";
import type { Role } from "@/lib/types";

/** "Notifikasi" dropdown (admin + support): push a notification, and the log of every push. */
const NOTIFICATIONS_NAV: NavItem = {
  href: "/support/notifications",
  label: "Notifikasi",
  icon: "campaign",
  children: [
    { href: "/support/notifications/new", label: "Buat Notifikasi", icon: "send" },
    { href: "/support/notifications", label: "Riwayat Notifikasi", icon: "schedule" },
  ],
};

/** The admin sidebar. Shared so it stays identical whether the admin is on an
 *  /admin page or inside the support console (/support/*). */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Ringkasan", icon: "grid_view" },
  { href: "/admin/citizens", label: "Pengguna (NIK)", icon: "badge" },
  { href: "/admin/support", label: "Akun Support", icon: "support_agent" },
  { href: "/admin/performance", label: "Performa Support", icon: "monitoring" },
  { href: "/admin/settings", label: "Pengaturan", icon: "tune" },
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
  { href: "/support/users", label: "Pengguna & Daerah", icon: "groups" },
  NOTIFICATIONS_NAV,
];

/** The plain support sidebar, for non-admin support staff only. Laporan and Peta live here
 *  (the old centered Laporan/Peta switch in the header was removed). */
export const SUPPORT_NAV: NavItem[] = [
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
  { href: "/support/users", label: "Semua Pengguna", icon: "groups" },
  NOTIFICATIONS_NAV,
];

/** Sidebar config (title + items) for the given role on a support page. */
export function sidebarForSupport(role: Role): { title: string; items: NavItem[] } {
  return role === "admin"
    ? { title: "Admin Panel", items: ADMIN_NAV }
    : { title: "Pusat Operasi", items: SUPPORT_NAV };
}
