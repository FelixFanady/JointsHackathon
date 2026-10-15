import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SupportTabs from "@/components/SupportTabs";
import { getCurrentUser } from "@/lib/session";
import { staffFaceVerified } from "@/lib/staffFace";
import { sidebarForSupport } from "@/lib/nav";
import { NavPendingProvider, PendingArea } from "@/components/NavPending";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await staffFaceVerified(user))) redirect("/verify-face");

  const { title, items } = sidebarForSupport(user.role);

  return (
    <NavPendingProvider>
      <div className="shell">
        <Sidebar title={title} items={items} user={user} />
        <main className="main support-main">
          <SupportTabs />
          <div className="support-body"><PendingArea>{children}</PendingArea></div>
        </main>
      </div>
    </NavPendingProvider>
  );
}
