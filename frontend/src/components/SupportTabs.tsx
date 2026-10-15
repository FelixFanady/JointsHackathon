"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmergencyNotifications from "@/components/EmergencyNotifications";
import { useUsers } from "@/components/useUsers";
import { useReports } from "@/components/useReports";
import { DEFAULT_SETTINGS } from "@/lib/types";

export default function SupportTabs() {
  const router = useRouter();
  const [windowMin, setWindowMin] = useState(DEFAULT_SETTINGS.emergency_window_minutes);
  const sosHours = Math.min(24 * 7, Math.ceil(windowMin / 60) + 1);
  const { reports, loading: sosLoading } = useReports(`hours=${sosHours}&kind=sos`, 30000);
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
      <div className="support-tools">
        <EmergencyNotifications
          reports={reports}
          users={users}
          windowMinutes={windowMin}
          loaded={!sosLoading}
          onLocate={(lat, lng) => goMap(lat, lng)}
        />
      </div>
    </div>
  );
}
