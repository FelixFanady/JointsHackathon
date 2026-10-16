"use client";

import { useEffect, useRef, useState } from "react";

export type RowMenuItem = {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void;
};

export default function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (items.length === 0) return null;

  function toggle() {
    if (pos) return setPos(null);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const height = items.length * 42 + 12;
    const below = r.bottom + 4 + height <= window.innerHeight - 8;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height), right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="icon-btn row-menu-btn"
        title="Aksi lainnya"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
      >
        <span aria-hidden>•••</span>
      </button>
      {pos && (
        <div ref={pop} role="menu" className="row-menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? "danger" : ""}
              onClick={() => {
                setPos(null);
                it.onClick();
              }}
            >
              {it.icon && <span className="msym sm">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
