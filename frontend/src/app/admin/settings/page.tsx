import { loadSettings } from "@/lib/settings";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan — SiagaKu Admin" };

export default async function SettingsPage() {
  const settings = await loadSettings();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Panel</div>
          <h1>Pengaturan</h1>
          <p>Atur kapan tombol darurat dianggap kritis secara otomatis. Berlaku langsung di peta support.</p>
        </div>
      </div>
      <SettingsClient initial={settings} />
    </div>
  );
}
