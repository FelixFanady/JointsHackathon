import HistoryClient from "./HistoryClient";

export const metadata = { title: "Riwayat Notifikasi — SiagaKu" };

export default function NotificationsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Notifikasi</div>
          <h1>Riwayat Notifikasi</h1>
          <p>Semua notifikasi yang pernah dikirim ke HP warga, lengkap dengan kategori, penerima, dan siapa yang membuatnya.</p>
        </div>
      </div>
      <HistoryClient />
    </div>
  );
}
