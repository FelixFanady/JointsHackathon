import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/session";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = [
    { href: "/support/reports", label: "Laporan", icon: "inbox" },
    { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Kembali ke Admin", icon: "admin_panel_settings" }] : []),
  ];

  return (
    <div className="shell">
      <Sidebar title="Pusat Operasi" items={items} user={user} />
      {children}
    </div>
  );
}
