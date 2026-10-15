"use client";

import Pager, { usePaged } from "@/components/Pager";

export type PerfRow = {
  id: string;
  full_name: string;
  unit: string | null;
  username: string;
  handled: number;
  valid: number;
  fake: number;
  avgLabel: string;
  active: boolean;
};

export default function PerformanceTable({ rows, max }: { rows: PerfRow[]; max: number }) {
  const paged = usePaged(rows);
  const offset = (paged.page - 1) * paged.size;
  return (
    <>
      <table className="table">
        <thead><tr><th>#</th><th>Personel</th><th style={{ minWidth: 180 }}>Ditangani</th><th className="num">Valid</th><th className="num">Palsu</th><th className="num">Rata-rata respons</th><th>Status</th></tr></thead>
        <tbody>
          {paged.slice.map((r, i) => (
            <tr key={r.id}>
              <td>{offset + i + 1}</td>
              <td><div className="person"><span className="av">{r.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span><div>{r.full_name}<small>{r.unit ?? r.username}</small></div></div></td>
              <td><div style={{ display: "flex", gap: 10, alignItems: "center" }}><b style={{ minWidth: 32 }}>{r.handled}</b><div className="bar" style={{ flex: 1 }}><i style={{ width: `${(r.handled / max) * 100}%` }} /></div></div></td>
              <td className="num" style={{ color: "#16a34a", fontWeight: 600 }}>{r.valid}</td>
              <td className="num" style={{ color: "#e5383b", fontWeight: 600 }}>{r.fake}</td>
              <td className="num">{r.avgLabel}</td>
              <td><span className={`badge ${r.active ? "valid" : "off"}`}>{r.active ? "Aktif" : "Nonaktif"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...paged} label="personel" />
    </>
  );
}
