"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import RouteSkeleton from "./RouteSkeleton";
import { routeMeta } from "@/lib/routeMeta";

/**
 * Instant page switch: the moment a menu link is clicked, the main area shows the target
 * page's title + skeleton, without waiting for the server (which in dev also compiles the
 * page, and in prod still has to answer). The real page replaces it as soon as it arrives.
 */

type Ctx = { pending: string | null; start: (href: string) => void };
const NavCtx = createContext<Ctx>({ pending: null, start: () => {} });

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  // Arrived (or the URL changed some other way): drop the placeholder.
  useEffect(() => { setPending(null); }, [path]);
  // Safety net: never leave a skeleton up if a navigation fails or is cancelled.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 15_000);
    return () => clearTimeout(t);
  }, [pending]);

  const start = useCallback((href: string) => {
    const target = href.split(/[?#]/)[0];
    if (target !== path) setPending(href);
  }, [path]);

  return <NavCtx.Provider value={{ pending, start }}>{children}</NavCtx.Provider>;
}

/** onClick for a <Link>: shows the placeholder for plain left clicks (not new-tab / modified clicks). */
export function useNavStart() {
  const { start } = useContext(NavCtx);
  return (href: string) => (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    start(href);
  };
}

/** Wraps the page area: renders the target page's skeleton while a navigation is pending. */
export function PendingArea({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(NavCtx);
  if (!pending) return <>{children}</>;
  return <RouteSkeleton {...routeMeta(pending)} />;
}
