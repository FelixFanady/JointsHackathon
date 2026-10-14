import { Suspense } from "react";
import ComposeClient from "./ComposeClient";

export const metadata = { title: "Buat Notifikasi — SiagaKu" };

export default function NewNotificationPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Notifikasi</div>
          <h1>Buat Notifikasi</h1>
          <p>Kirim pemberitahuan langsung ke HP warga. Pilih kategori, jenis kejadian (menentukan bunyi), dan penerimanya.</p>
        </div>
      </div>
      {/* useSearchParams (pre-fill from the Users page) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ComposeClient />
      </Suspense>
    </div>
  );
}
