import { db } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import { lockedNiks } from "@/lib/face";
import { needsStaffFace, staffFaceIndex, staffLockId } from "@/lib/staffFace";
import { isRootAdmin, superAdminIds } from "@/lib/superAdmin";
import { bypassEnabled, bypassIds } from "@/lib/faceBypass";
import { loadAllAreas } from "@/lib/supportArea";
import { ALL_AREAS } from "@/lib/provinces";
import type { Profile } from "@/lib/types";
import UsersClient, { type StaffRow } from "./UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — SiagaKu Admin" };

export default async function UsersPage() {
  const [me, { data }, faces, locks, supers, bypassed, areas] = await Promise.all([
    getCurrentUser(),
    db()
      .from("profiles")
      .select("id,username,full_name,role,unit,active,created_at")
      .in("role", ["admin", "support"])
      .order("created_at", { ascending: false }),
    staffFaceIndex().catch((): Record<string, string> => ({})),
    lockedNiks().catch((): Record<string, number> => ({})),
    superAdminIds().catch(() => new Set<string>()),
    bypassIds("staff").catch(() => new Set<string>()),
    loadAllAreas().catch((): Record<string, string[]> => ({})),
  ]);

  const rows: StaffRow[] = ((data ?? []) as Profile[]).map((p) => ({
    ...p,
    face: !needsStaffFace(p) ? "exempt" : faces[p.id] ? "registered" : "none",
    face_at: faces[p.id] || null,
    face_locked: locks[staffLockId(p.id)] ?? 0,
    root: p.role === "admin" && isRootAdmin(p),
    bypass: bypassEnabled() && bypassed.has(p.id),
    areas: p.role === "support" ? areas[p.id] ?? [ALL_AREAS] : [],
    super: p.role === "admin" && (isRootAdmin(p) || supers.has(p.id)),
  }));
  const meSuper = !!me && rows.some((r) => r.id === me.id && r.super);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Users</h1>
          <p>Semua akun staf yang bisa login di web: admin dan support. Setiap staf wajib verifikasi wajah sebelum bertugas.</p>
        </div>
      </div>
      <UsersClient initial={rows} meId={me?.id ?? ""} meSuper={meSuper} />
    </div>
  );
}
