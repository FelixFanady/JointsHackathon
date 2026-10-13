"use client";

import { useEffect, useRef, useState } from "react";

export default function Modal({
  title,
  sub,
  onClose,
  children,
  size,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "lg";
}) {
  const [leaving, setLeaving] = useState(false);
  const closedRef = useRef(false);

  // Play the exit animation, then actually close.
  function requestClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    setLeaving(true);
    window.setTimeout(onClose, 160);
  }

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className={`overlay${leaving ? " leaving" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
      onKeyDown={(e) => e.key === "Escape" && requestClose()}
    >
      <div className={`modal${size === "lg" ? " lg" : ""}${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <button className="modal-x icon-btn" aria-label="Tutup" onClick={requestClose}>
          <span className="msym sm">close</span>
        </button>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
