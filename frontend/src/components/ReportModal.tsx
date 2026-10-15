"use client";

import { useCallback, useEffect, useState } from "react";
import ReportDetail from "./ReportDetail";
import type { Report } from "@/lib/types";

export default function ReportModal({ report, onChanged, onClose }: { report: Report; onChanged: () => void; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 160);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div className={`overlay${leaving ? " leaving" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal lg report-modal${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label={`Detail laporan ${report.category}`}>
        <ReportDetail report={report} onChanged={onChanged} onClose={close} />
      </div>
    </div>
  );
}
