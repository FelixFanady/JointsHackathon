import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/support/reports");

  const items = [
    { href: "/admin", label: "Ringkasan", icon: "grid_view" },
    { href: "/admin/citizens", label: "Pengguna (NIK)", icon: "badge" },
    { href: "/admin/support", label: "Akun Support", icon: "support_agent" },
    { href: "/admin/performance", label: "Performa Support", icon: "monitoring" },
    { href: "/admin/settings", label: "Pengaturan", icon: "tune" },
    { href: "/support/reports", label: "Konsol Support", icon: "inbox" },
  ];

  return (
    <div className="shell">
      <Sidebar title="Admin Panel" items={items} user={user} />
      <main className="main">{children}</main>
    </div>
  );
}
