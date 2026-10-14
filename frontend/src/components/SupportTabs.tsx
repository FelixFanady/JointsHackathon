"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import EmergencyNotifications from "@/components/EmergencyNotifications";
import { useUsers } from "@/components/useUsers";
import { useReports } from "@/components/useReports";
import { DEFAULT_SETTINGS } from "@/lib/types";

const TABS = [
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
];

/** Page-level header of the support console: centered Laporan/Peta switch plus
 *  the emergency bell and the all-users directory on the right. Lives in the
 *  layout so these tools are visible on BOTH views and the sidebar never changes. */
export default function SupportTabs() {
  const path = usePathname();
  const router = useRouter();
  const [windowMin, setWindowMin] = useState(DEFAULT_SETTINGS.emergency_window_minutes);
  // Header bell only needs recent SOS + who sent them: a small, infrequent poll (no photos, SOS only).
  const sosHours = Math.min(24 * 7, Math.ceil(windowMin / 60) + 1);
  const { reports } = useReports(`hours=${sosHours}&kind=sos`, 30000);
  const { users } = useUsers(60000, { photos: false });

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setWindowMin(s.emergency_window_minutes))
      .catch(() => {});
  }, []);

  const goMap = (lat: number, lng: number) => {
    router.push(`/support/map?focus=${lat},${lng}`);
  };

  return (
    <div className="support-switch">
      <div className="tabs" role="tablist" aria-label="Tampilan Support">
        {TABS.map((t) => {
          const on = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={on ? "on" : ""} role="tab" aria-selected={on}>
              <span className="msym sm">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="support-tools">
        <EmergencyNotifications
          reports={reports}
          users={users}
          windowMinutes={windowMin}
          onLocate={(lat, lng) => goMap(lat, lng)}
        />
      </div>
    </div>
  );
}
