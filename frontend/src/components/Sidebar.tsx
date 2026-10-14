"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

export default function Sidebar({
  title,
  items,
  user,
}: {
  title: string;
  items: NavItem[];
  user: { full_name: string; role: string; unit: string | null };
}) {
  const path = usePathname();
  const router = useRouter();
  const initials = user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo"><span className="msym">shield</span></div>
        <div>
          <strong>SiagaKu</strong>
          <small>{title}</small>
        </div>
      </div>
      <nav aria-label="Navigasi utama">
        {items.map((it) => {
          const active =
            it.href === "/admin"
              ? path === "/admin"
              : it.href === "/support/reports"
                ? path.startsWith("/support/reports") || path.startsWith("/support/map") // "Konsol Support" covers Laporan & Peta
                : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <span className="msym">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="me">
        <div className="avatar">{initials}</div>
        <div className="who">
          <strong>{user.full_name}</strong>
          <small>{user.role === "admin" ? "Administrator" : user.unit || "Petugas Support"}</small>
        </div>
        <button onClick={logout} aria-label="Keluar" title="Keluar">
          <span className="msym sm">logout</span>
        </button>
      </div>
    </aside>
  );
}
