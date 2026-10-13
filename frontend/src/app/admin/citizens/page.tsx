import { db } from "@/lib/supabase";
import type { Citizen } from "@/lib/types";
import CitizensClient from "./CitizensClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengguna (NIK) — SiagaKu Admin" };

export default async function CitizensPage() {
  const { data } = await db()
    .from("citizens")
    .select("nik,full_name,active,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Pengguna (NIK)</h1>
          <p>Daftar NIK dan nama yang dipakai aplikasi mobile untuk login dan mengisi otomatis laporan warga.</p>
        </div>
      </div>
      <CitizensClient initial={(data ?? []) as Citizen[]} />
    </div>
  );
}
