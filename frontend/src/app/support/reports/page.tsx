import ReportsClient from "./ReportsClient";

export const metadata = { title: "Laporan — SiagaKu Support" };

export default function ReportsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Konsol Support</div>
          <h1>Laporan</h1>
          <p>SOS dan laporan warga masuk secara real-time. Tandai valid atau palsu tanpa menunggu ambang laporan terpenuhi.</p>
        </div>
      </div>
      <ReportsClient />
    </div>
  );
}
