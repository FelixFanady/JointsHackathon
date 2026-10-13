import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="login">
      <section className="hero">
        <div>
          <span className="chip">Portal Internal Tim Operasional</span>
          <div className="brand-row">
            <div className="logo"><span className="msym">shield</span></div>
            <strong>SiagaKu <span>Support</span></strong>
          </div>
        </div>
        <div>
          <h2>Pantau. Verifikasi. Lindungi.</h2>
          <p>Sistem koordinasi penanganan laporan darurat dan pemantauan warga terpadu seluruh wilayah.</p>
        </div>
        <footer>
          <span>© 2026 SiagaKu Platform</span>
          <span>Akses hanya untuk petugas terdaftar</span>
        </footer>
      </section>
      <section className="panel">
        <div className="form-card">
          <div className="key"><span className="msym">vpn_key</span></div>
          <h1>Masuk ke Akun Anda</h1>
          <p className="lead">Gunakan kredensial yang dibuat oleh admin untuk melanjutkan ke konsol.</p>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
