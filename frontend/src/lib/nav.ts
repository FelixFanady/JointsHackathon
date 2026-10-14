import type { NavItem } from "@/components/Sidebar";
import type { Role } from "@/lib/types";

/** The admin sidebar. Shared so it stays identical whether the admin is on an
 *  /admin page or inside the support console (/support/*). */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Ringkasan", icon: "grid_view" },
  { href: "/admin/citizens", label: "Pengguna (NIK)", icon: "badge" },
  { href: "/admin/support", label: "Akun Support", icon: "support_agent" },
  { href: "/admin/performance", label: "Performa Support", icon: "monitoring" },
  { href: "/admin/settings", label: "Pengaturan", icon: "tune" },
  { href: "/support/reports", label: "Konsol Support", icon: "inbox" },
  { href: "/support/users", label: "Pengguna & Daerah", icon: "groups" },
];

/** The plain support sidebar, for non-admin support staff only.
 *  Laporan/Peta are intentionally NOT here — the centered SupportTabs is the
 *  single switch between those two views, so the sidebar does not duplicate it
 *  (previously support staff saw the same two buttons twice). */
export const SUPPORT_NAV: NavItem[] = [
  { href: "/support/reports", label: "Konsol Support", icon: "inbox" },
  { href: "/support/users", label: "Semua Pengguna", icon: "groups" },
];

/** Sidebar config (title + items) for the given role on a support page. */
export function sidebarForSupport(role: Role): { title: string; items: NavItem[] } {
  return role === "admin"
    ? { title: "Admin Panel", items: ADMIN_NAV }
    : { title: "Pusat Operasi", items: SUPPORT_NAV };
}
