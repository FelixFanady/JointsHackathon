"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Pin } from "@/components/AddressPickerMap";

const PickerMap = dynamic(() => import("@/components/AddressPickerMap"), {
  ssr: false,
  loading: () => <div className="pick-map pick-loading">Memuat peta…</div>,
});

export default function AddressPicker({
  initialPin,
  onAddress,
  onPin,
}: {
  initialPin: Pin | null;
  onAddress: (address: string) => void;
  onPin: (pin: Pin) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState<Pin | null>(initialPin);
  const [fly, setFly] = useState<(Pin & { at: number }) | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"" | "pin" | "search">("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function picked(p: Pin) {
    setPin(p);
    onPin(p);
    setBusy("pin");
    setNote(null);
    try {
      const r = await fetch(`/api/geocode?lat=${p.lat}&lng=${p.lng}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNote({ ok: false, text: j.error ?? "Alamat di titik ini tidak ditemukan. Isi manual." });
      } else {
        onAddress(j.address);
        setNote({ ok: true, text: j.region?.label ? `Daerah: ${j.region.label}` : "Alamat terisi dari peta." });
      }
    } catch {
      setNote({ ok: false, text: "Tidak dapat menghubungi layanan peta." });
    } finally {
      setBusy("");
    }
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    setBusy("search");
    setNote(null);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setNote({ ok: false, text: j.error ?? "Tempat tidak ditemukan." });
      else {
        setFly({ lat: j.lat, lng: j.lng, at: Date.now() });
        setNote({ ok: true, text: `Ditemukan: ${j.label}. Klik peta untuk menaruh pin.` });
      }
    } catch {
      setNote({ ok: false, text: "Tidak dapat menghubungi layanan peta." });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="addr-picker">
      <button type="button" className={`btn sm ${open ? "primary" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="msym sm">add_location_alt</span>{open ? "Tutup peta" : "Pilih di peta"}
      </button>

      {open && (
        <div className="pick-panel">
          <div className="pick-search" role="search">
            <input
              className="input"
              placeholder="Cari tempat: nama jalan, perumahan, kelurahan…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
              aria-label="Cari tempat di peta"
            />
            <button type="button" className="btn sm" disabled={busy === "search" || q.trim().length < 3} onClick={() => void search()}>
              <span className={`msym sm ${busy === "search" ? "spin" : ""}`}>{busy === "search" ? "progress_activity" : "search"}</span>Cari
            </button>
          </div>
          <PickerMap pin={pin} fly={fly} onPick={picked} />
          <div className={`pick-note ${note ? (note.ok ? "ok" : "bad") : ""}`} role="status">
            {busy === "pin" ? (<><span className="msym sm spin">progress_activity</span>Mencari alamat di titik ini…</>)
              : note ? note.text
              : "Klik peta untuk menaruh pin, atau geser pin untuk memindahkan. Alamat terisi otomatis dan masih bisa diedit."}
          </div>
        </div>
      )}
    </div>
  );
}
