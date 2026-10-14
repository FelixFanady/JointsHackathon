"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  /** Small muted text on the right, e.g. a count. */
  hint?: string | number;
};

/**
 * Dashboard dropdown that replaces the browser's native <select> list, so every dropdown looks the same.
 * Same keyboard behaviour as a select: ↑/↓, Home/End, Enter/Space, Esc, and typing a letter jumps to it.
 * The list is rendered in a portal (position: fixed) so cards, tables and modals never clip it.
 */
export default function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = "",
  placeholder = "Pilih…",
  "aria-label": ariaLabel,
  disabled = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const typed = useRef({ s: "", t: 0 });

  const selIndex = options.findIndex((o) => o.value === value);
  const current = selIndex >= 0 ? options[selIndex] : null;

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(320, options.length * 42 + 12);
    const up = below < Math.min(want, 200) && above > below;
    const width = Math.max(r.width, 180);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos(up
      ? { left, bottom: window.innerHeight - r.top + 6, width, maxH: Math.min(320, above) }
      : { left, top: r.bottom + 6, width, maxH: Math.min(320, below) });
  }, [options.length]);

  function show() {
    if (disabled) return;
    setActive(selIndex >= 0 ? selIndex : 0);
    place();
    setOpen(true);
  }
  function close(focusBtn = true) {
    setOpen(false);
    if (focusBtn) btn.current?.focus();
  }
  function pick(i: number) {
    const o = options[i];
    if (!o) return;
    if (o.value !== value) onChange(o.value);
    close();
  }

  // Follow the button while open; close on outside click.
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onMove = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onKey(e: React.KeyboardEvent) {
    const n = options.length;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(n - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(n - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key.toLowerCase(), t: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`input select-btn ${open ? "open" : ""} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? placeholder}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        <span className={`sb-label ${current ? "" : "placeholder"}`}>{current?.label ?? placeholder}</span>
        {current?.hint !== undefined && <span className="sb-hint">{current.hint}</span>}
        <span className="msym sm sb-chev" aria-hidden>expand_more</span>
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={`${id}-o${active}`}
            className="select-pop"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxH }}
            onKeyDown={onKey}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${id}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={i === selIndex}
                className={`${i === active ? "active" : ""} ${i === selIndex ? "sel" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="msym sm so-check" aria-hidden>{i === selIndex ? "check" : ""}</span>
                <span className="so-label">{o.label}</span>
                {o.hint !== undefined && <span className="so-hint">{o.hint}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
