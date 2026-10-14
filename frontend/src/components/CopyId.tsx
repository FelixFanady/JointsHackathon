"use client";

import { useState } from "react";

/** Report ID chip with a copy button ("ID Laporan LW-1A2B3C4D  ⧉"). */
export default function CopyId({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the ID is still selectable text */
    }
  }
  return (
    <div className="report-id">
      <span className="lbl">ID Laporan</span>
      <span className="mono code">{code}</span>
      <button type="button" className="cp" onClick={copy} aria-label={`Salin ID laporan ${code}`} title="Salin ID">
        <span className="msym xs">{copied ? "check" : "content_copy"}</span>
        {copied ? "Tersalin" : "Salin"}
      </button>
    </div>
  );
}
