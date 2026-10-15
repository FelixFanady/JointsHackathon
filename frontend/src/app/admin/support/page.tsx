import { db } from "@/lib/supabase";
import { loadAllAreas } from "@/lib/supportArea";
import { ALL_AREAS } from "@/lib/provinces";
import type { Profile } from "@/lib/types";
import SupportClient from "./SupportClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Support — SiagaKu Admin" };

export default async function SupportPage() {
  const [{ data }, areas] = await Promise.all([
    db()
      .from("profiles")
      .select("id,username,full_name,role,unit,active,created_at")
      .eq("role", "support")
      .order("created_at", { ascending: false }),
    loadAllAreas(),
  ]);
  const rows = ((data ?? []) as Profile[]).map((p) => ({ ...p, areas: areas[p.id] ?? [ALL_AREAS] }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Akun Support</h1>
          <p>Buat kredensial untuk petugas yang akan login di web. Petugas tidak bisa mendaftar sendiri.</p>
        </div>
      </div>
      <SupportClient initial={rows} />
    </div>
  );
}
