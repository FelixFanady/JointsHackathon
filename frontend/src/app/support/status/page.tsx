import StatusClient from "./StatusClient";

export const metadata = { title: "Status Wilayah — SiagaKu" };

export default function StatusPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Status Wilayah</div>
          <h1>Status Wilayah</h1>
          <p>Tetapkan status kebencanaan untuk seluruh wilayah atau satu provinsi, misalnya SIAGA BENCANA GEMPA di Aceh. Status tampil di aplikasi warga sampai diakhiri.</p>
        </div>
      </div>
      <StatusClient />
    </div>
  );
}
