import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadStaffFace, staffFaceVerified, staffLockId } from "@/lib/staffFace";
import { lockedMinutes } from "@/lib/face";
import VerifyFaceClient from "./VerifyFaceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifikasi Wajah — SiagaKu Pusat Operasi" };

export default async function VerifyFacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await staffFaceVerified(user)) redirect(user.role === "admin" ? "/admin" : "/support/reports");

  let registered = false;
  let broken = false;
  try {
    registered = !!(await loadStaffFace(user.id));
  } catch {
    broken = true;
  }
  const locked = await lockedMinutes(staffLockId(user.id)).catch(() => 0);

  return (
    <VerifyFaceClient
      name={user.full_name}
      role={user.role}
      mode={registered ? "verify" : "enroll"}
      broken={broken}
      lockedMinutes={locked}
      next={user.role === "admin" ? "/admin" : "/support/reports"}
    />
  );
}
