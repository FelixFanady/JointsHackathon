import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LoginForm from "./LoginForm";
import Logo from "@/components/Logo";

export const metadata = { title: "Masuk — SiagaKu Pusat Operasi" };

const LEVELS = [
  { key: "normal", label: "Normal", note: "Tidak ada ancaman aktif" },
  { key: "waspada", label: "Waspada", note: "Potensi bencana, pantau" },
  { key: "siaga", label: "Siaga", note: "Bersiap evakuasi" },
  { key: "awas", label: "Awas", note: "Evakuasi sekarang" },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="login">
      <aside className="login-side" aria-label="Tentang SiagaKu">
        <div className="login-brand">
          <Logo />
          <div>
            <strong>SiagaKu</strong>
            <small>Pusat Operasi</small>
          </div>
        </div>

        <div className="login-copy">
          <h2>Konsol petugas untuk laporan darurat warga.</h2>
          <p>
            Laporan dan SOS dari aplikasi SiagaKu masuk ke sini. Petugas
            memverifikasi, memetakan, dan mengirim peringatan ke warga sesuai
            wilayah tugasnya.
          </p>

          <div
            className="levels"
            role="list"
            aria-label="Tingkat status wilayah"
          >
            {LEVELS.map((l) => (
              <div key={l.key} className={`lv lv-${l.key}`} role="listitem">
                <i aria-hidden />
                <b>{l.label}</b>
                <span>{l.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="login-foot">
          <div className="sos">
            <span className="msym sm">call</span>
            <span>
              Butuh bantuan darurat? Hubungi <b>112</b>. Halaman ini hanya untuk
              petugas.
            </span>
          </div>
          <small>© 2026 SiagaKu</small>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-form">
          <div className="login-brand compact" aria-hidden>
            <Logo />
            <strong>SiagaKu</strong>
          </div>
          <h1>Masuk</h1>
          <p className="lead">
            Gunakan username dan kata sandi yang diberikan admin.
          </p>
          <LoginForm />
          <p className="help">
            Lupa kata sandi atau akun terkunci? Minta admin untuk meresetnya.
          </p>
        </div>
      </main>
    </div>
  );
}
