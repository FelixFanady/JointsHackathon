import { db } from "@/lib/supabase";
import { loadAllProfiles } from "@/lib/citizenProfile";
import { lockedNiks } from "@/lib/face";
import type { Citizen } from "@/lib/types";
import CitizensClient from "./CitizensClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengguna (NIK) — SiagaKu Admin" };

export default async function CitizensPage() {
  const basePromise = db()
    .from("citizens")
    .select("nik,full_name,active,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  const allProfilesPromise = loadAllProfiles();

  const [{ data }, profiles, locks] = await Promise.all([basePromise, allProfilesPromise, lockedNiks().catch((): Record<string, number> => ({}))]);
  const base = (data ?? []) as { nik: string; full_name: string; active: boolean; created_at: string }[];
  const rows: Citizen[] = base.map((c) => ({ ...c, ...(profiles[c.nik] ?? {}) }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Pengguna (NIK)</h1>
          <p>Daftar NIK dan nama yang dipakai aplikasi mobile untuk login dan mengisi otomatis laporan warga.</p>
        </div>
      </div>
      <CitizensClient initial={rows} locks={locks} />
    </div>
  );
}
