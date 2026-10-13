import { db } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import SupportClient from "./SupportClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Support — SiagaKu Admin" };

export default async function SupportPage() {
  const { data } = await db()
    .from("profiles")
    .select("id,username,full_name,role,unit,active,created_at")
    .eq("role", "support")
    .order("created_at", { ascending: false });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Akun Support</h1>
          <p>Buat kredensial untuk petugas yang akan login di web. Petugas tidak bisa mendaftar sendiri.</p>
        </div>
      </div>
      <SupportClient initial={(data ?? []) as Profile[]} />
    </div>
  );
}
