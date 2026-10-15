"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useNavStart, usePendingPath } from "./NavPending";

export type NavItem = { href: string; label: string; icon: string; children?: NavItem[] };
export type NavEntry = NavItem | { section: string };

type Nav = ReturnType<typeof useNavStart>;

function NavLink({ it, active, nav, sub = false }: { it: NavItem; active: boolean; nav: Nav; sub?: boolean }) {
  return (
    <Link href={it.href} onClick={nav(it.href)} className={`${active ? "active" : ""}${sub ? " sub" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="msym">{it.icon}</span>
      {it.label}
    </Link>
  );
}

function NavGroup({ item, path, nav }: { item: NavItem; path: string; nav: Nav }) {
  const kids = item.children ?? [];
  const match = kids
    .filter((c) => path === c.href || path.startsWith(c.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const [open, setOpen] = useState(!!match);
  useEffect(() => { if (match) setOpen(true); }, [match]);
  return (
    <div className={`nav-group${open ? " open" : ""}${match ? " has-active" : ""}`}>
      <button type="button" className="nav-group-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="msym">{item.icon}</span>
        {item.label}
        <span className="msym sm chev" aria-hidden>expand_more</span>
      </button>
      {open && (
        <div className="nav-group-items">
          {kids.map((c) => <NavLink key={c.href} it={c} active={c === match} nav={nav} sub />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  title,
  items,
  user,
}: {
  title: string;
  items: NavEntry[];
  user: { full_name: string; role: string; unit: string | null };
}) {
  const current = usePathname();
  const path = usePendingPath() ?? current;
  const router = useRouter();
  const nav = useNavStart();
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
        {items.map((it) =>
          "section" in it ? (
            <div key={`s:${it.section}`} className="nav-section" role="presentation">{it.section}</div>
          ) : it.children?.length ? (
            <NavGroup key={it.label} item={it} path={path} nav={nav} />
          ) : (
            <NavLink key={it.href} it={it} active={it.href === "/admin" ? path === "/admin" : path.startsWith(it.href)} nav={nav} />
          ),
        )}
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
