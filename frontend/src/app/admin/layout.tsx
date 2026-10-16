import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/session";
import { staffFaceVerified } from "@/lib/staffFace";
import { ADMIN_NAV } from "@/lib/nav";
import { NavPendingProvider, PendingArea } from "@/components/NavPending";
import StepUpGate from "@/components/StepUpGate";
import { needsStaffFace } from "@/lib/staffFace";
import { isBypassed } from "@/lib/faceBypass";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/support/reports");
  if (!(await staffFaceVerified(user))) redirect("/verify-face");
  const stepUp = needsStaffFace(user) && !(await isBypassed("staff", user.id));

  return (
    <NavPendingProvider>
      <div className="shell">
        <Sidebar title="Admin Panel" items={ADMIN_NAV} user={user} />
        <main className="main"><PendingArea>{children}</PendingArea></main>
      </div>
      {stepUp && <StepUpGate name={user.full_name} />}
    </NavPendingProvider>
  );
}
