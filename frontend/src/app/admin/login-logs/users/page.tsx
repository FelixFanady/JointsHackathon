import { loadLoginLogs } from "@/lib/loginLog";
import LoginLogsClient, { type LogRow } from "@/components/LoginLogsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Login Logs Pengguna — SiagaKu Admin" };

export default async function CitizenLoginLogsPage() {
  const { rows, missing } = await loadLoginLogs("citizen");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Warga</div>
          <h1>Login Logs · Pengguna</h1>
          <p>Riwayat login warga di aplikasi.</p>
        </div>
      </div>
      <LoginLogsClient
        rows={rows as LogRow[]}
        kind="citizen"
        missing={missing}
      />
    </div>
  );
}
