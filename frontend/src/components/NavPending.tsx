"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import RouteSkeleton from "./RouteSkeleton";
import { routeMeta } from "@/lib/routeMeta";


type Ctx = { pending: string | null; start: (href: string) => void };
const NavCtx = createContext<Ctx>({ pending: null, start: () => {} });

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => { setPending(null); }, [path]);
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

export function useNavStart() {
  const { start } = useContext(NavCtx);
  return (href: string) => (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    start(href);
  };
}

export function usePendingPath(): string | null {
  const { pending } = useContext(NavCtx);
  return pending ? pending.split(/[?#]/)[0] : null;
}

export function PendingArea({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(NavCtx);
  if (!pending) return <>{children}</>;
  return <RouteSkeleton {...routeMeta(pending)} />;
}
