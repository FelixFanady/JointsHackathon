import { loadLoginLogs } from "@/lib/loginLog";
import LoginLogsClient, { type LogRow } from "@/components/LoginLogsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Login Logs Support & Admin — SiagaKu Admin" };

export default async function StaffLoginLogsPage() {
  const { rows, missing } = await loadLoginLogs("staff");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Tim &amp; Akses</div>
          <h1>Login Logs · Support &amp; Admin</h1>
          <p>Lihat riwayat login staff.</p>
        </div>
      </div>
      <LoginLogsClient rows={rows as LogRow[]} kind="staff" missing={missing} />
    </div>
  );
}
