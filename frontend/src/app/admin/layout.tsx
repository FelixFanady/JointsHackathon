import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/session";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/support/reports");

  return (
    <div className="shell">
      <Sidebar title="Admin Panel" items={ADMIN_NAV} user={user} />
      <main className="main">{children}</main>
    </div>
  );
}
