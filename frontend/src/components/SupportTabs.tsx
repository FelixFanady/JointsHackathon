"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/support/reports", label: "Laporan", icon: "inbox" },
  { href: "/support/map", label: "Peta Pemantauan", icon: "map" },
];

/** Centered page-level switch between the two support views.
 *  Lives in the page body so the sidebar stays identical across views. */
export default function SupportTabs() {
  const path = usePathname();
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
    </div>
  );
}
