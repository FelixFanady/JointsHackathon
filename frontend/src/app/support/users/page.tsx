import UsersClient from "./UsersClient";

export const metadata = { title: "Semua Pengguna — SiagaKu Support" };

export default function UsersPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Konsol Support</div>
          <h1>Semua Pengguna</h1>
          <p>Seluruh warga terdaftar beserta daerah, login terakhir, dan status koneksi app. Kirim notifikasi ke satu, beberapa, atau semua pengguna.</p>
        </div>
      </div>
      <UsersClient />
    </div>
  );
}
