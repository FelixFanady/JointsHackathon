"use client";

import { useEffect, useMemo, useState } from "react";
import Select from "./Select";

export const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

export function usePaged<T>(items: T[], resetKey: unknown = null, initialSize = 10) {
  const [size, setSize] = useState<number>(initialSize);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(1), [JSON.stringify(resetKey), size]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  const current = Math.min(page, pages);
  const slice = useMemo(() => items.slice((current - 1) * size, current * size), [items, current, size]);
  return { slice, page: current, pages, size, setSize, setPage, total: items.length };
}

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export default function Pager({
  page,
  pages,
  size,
  total,
  setPage,
  setSize,
  label = "data",
}: {
  page: number;
  pages: number;
  size: number;
  total: number;
  setPage: (p: number) => void;
  setSize: (s: number) => void;
  label?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav className="pager" aria-label={`Navigasi halaman ${label}`}>
      <label className="pager-size">
        Tampilkan
        <Select value={size} onChange={setSize} aria-label="Jumlah per halaman" options={PAGE_SIZES.map((s) => ({ value: s, label: String(s) }))} />
        per halaman
      </label>
      <span className="pager-info">{from}–{to} dari {total} {label}</span>
      <div className="pager-btns">
        <button type="button" className="pg" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          ‹ <span>Sebelumnya</span>
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="pg-gap" aria-hidden>…</span>
          ) : (
            <button key={p} type="button" className={`pg num ${p === page ? "on" : ""}`} onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Halaman ${p}`}>
              {p}
            </button>
          ),
        )}
        <button type="button" className="pg" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">
          <span>Berikutnya</span> ›
        </button>
      </div>
    </nav>
  );
}
