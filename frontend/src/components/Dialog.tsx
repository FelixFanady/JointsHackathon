"use client";

import { useEffect, useRef, useState } from "react";


export type DialogTone = "primary" | "danger" | "warning";
export type DialogOptions = {
  title: string;
  message?: string;
  details?: [string, string][];
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  icon?: string;
};
type Req = DialogOptions & { kind: "confirm" | "alert"; resolve: (ok: boolean) => void };

let enqueue: ((r: Req) => void) | null = null;

export function confirmDialog(o: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (enqueue) enqueue({ ...o, kind: "confirm", resolve });
    else resolve(window.confirm([o.title, o.message].filter(Boolean).join("\n\n")));
  });
}

export function alertDialog(o: DialogOptions): Promise<void> {
  return new Promise((resolve) => {
    if (enqueue) enqueue({ ...o, kind: "alert", resolve: () => resolve() });
    else { window.alert([o.title, o.message].filter(Boolean).join("\n\n")); resolve(); }
  });
}

const DEFAULT_ICON: Record<DialogTone, string> = { primary: "info", danger: "emergency_home", warning: "warning" };

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [leaving, setLeaving] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  const cur = queue[0];

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    return () => { enqueue = null; };
  }, []);

  useEffect(() => {
    if (!cur) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => okRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      prevFocus?.focus?.();
    };
  }, [cur]);

  if (!cur) return null;
  const tone = cur.tone ?? "primary";

  function close(ok: boolean) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      cur.resolve(ok);
      setLeaving(false);
      setQueue((q) => q.slice(1));
    }, 150);
  }

  return (
    <div
      className={`overlay${leaving ? " leaving" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && close(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); close(false); }
      }}
    >
      <div
        className={`modal dialog ${tone}${leaving ? " leaving" : ""}`}
        role={cur.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby={cur.message ? "dlg-msg" : undefined}
      >
        <div className="dlg-head">
          <span className="dlg-ic msym" aria-hidden>{cur.icon ?? DEFAULT_ICON[tone]}</span>
          <h2 id="dlg-title">{cur.title}</h2>
        </div>
        {cur.message && <p id="dlg-msg" className="dlg-msg">{cur.message}</p>}
        {cur.details && cur.details.length > 0 && (
          <dl className="dlg-details">
            {cur.details.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        {cur.note && <div className="alert warn dlg-note"><span className="msym sm">info</span><span>{cur.note}</span></div>}
        <div className="actions">
          {cur.kind === "confirm" && (
            <button type="button" className="btn ghost" onClick={() => close(false)}>{cur.cancelLabel ?? "Batal"}</button>
          )}
          <button ref={okRef} type="button" className={`btn ${tone === "danger" ? "danger" : "primary"}`} onClick={() => close(true)}>
            {cur.confirmLabel ?? (cur.kind === "confirm" ? "Lanjutkan" : "Mengerti")}
          </button>
        </div>
      </div>
    </div>
  );
}
