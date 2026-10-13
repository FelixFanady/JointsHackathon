import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SupportTabs from "@/components/SupportTabs";
import { getCurrentUser } from "@/lib/session";
import { sidebarForSupport } from "@/lib/nav";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // An admin keeps the FULL admin sidebar here — it must not change when they
  // open the support console. Only the centered tabs switch Laporan <-> Peta.
  const { title, items } = sidebarForSupport(user.role);

  return (
    <div className="shell">
      <Sidebar title={title} items={items} user={user} />
      <main className="main support-main">
        <SupportTabs />
        <div className="support-body">{children}</div>
      </main>
    </div>
  );
}
