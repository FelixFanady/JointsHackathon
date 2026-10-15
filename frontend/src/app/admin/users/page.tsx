import { db } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { lockedNiks } from "@/lib/face";
import { needsStaffFace, staffFaceIndex, staffLockId } from "@/lib/staffFace";
import type { Profile } from "@/lib/types";
import UsersClient, { type StaffRow } from "./UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — SiagaKu Admin" };

export default async function UsersPage() {
  const [me, { data }, faces, locks] = await Promise.all([
    getCurrentUser(),
    db()
      .from("profiles")
      .select("id,username,full_name,role,unit,active,created_at")
      .in("role", ["admin", "support"])
      .order("created_at", { ascending: false }),
    staffFaceIndex().catch((): Record<string, string> => ({})),
    lockedNiks().catch((): Record<string, number> => ({})),
  ]);

  const rows: StaffRow[] = ((data ?? []) as Profile[]).map((p) => ({
    ...p,
    face: !needsStaffFace(p) ? "exempt" : faces[p.id] ? "registered" : "none",
    face_at: faces[p.id] || null,
    face_locked: locks[staffLockId(p.id)] ?? 0,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Users</h1>
          <p>Semua akun staf yang bisa login di web: admin dan support. Setiap staf wajib verifikasi wajah sebelum bertugas.</p>
        </div>
      </div>
      <UsersClient initial={rows} meId={me?.id ?? ""} />
    </div>
  );
}
