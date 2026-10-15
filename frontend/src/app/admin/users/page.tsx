import { db } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/session";
import type { Profile } from "@/lib/types";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — SiagaKu Admin" };

export default async function UsersPage() {
  const [me, { data }] = await Promise.all([
    getCurrentUser(),
    db()
      .from("profiles")
      .select("id,username,full_name,role,unit,active,created_at")
      .in("role", ["admin", "support"])
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Users</h1>
          <p>Semua akun staf yang bisa login di web: admin dan support. Admin baru hanya bisa dibuat oleh admin.</p>
        </div>
      </div>
      <UsersClient initial={(data ?? []) as Profile[]} meId={me?.id ?? ""} />
    </div>
  );
}
