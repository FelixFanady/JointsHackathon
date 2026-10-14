"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapCluster = {
  anchorId: string;
  lat: number;
  lng: number;
  count: number;
  critical: boolean;
  confirmed: boolean;
  /** Category colours of the reports at this point (biggest share first). */
  segments: { color: string; share: number }[];
};

const INDONESIA: L.LatLngTuple = [-2.5, 118];

/** Marker = colour of its category (a pie when a point mixes categories); size grows with the number of reports. */
function iconFor(c: MapCluster, threshold: number, selected: boolean) {
  const t = Math.min(1, c.count / Math.max(threshold, 2));
  const size = 26 + Math.round(t * 26);
  const main = c.segments[0]?.color ?? "#64748b";
  let acc = 0;
  const bg =
    c.segments.length > 1
      ? `conic-gradient(${c.segments.map((s) => `${s.color} ${(acc * 360).toFixed(1)}deg ${((acc += s.share) * 360).toFixed(1)}deg`).join(", ")})`
      : main;
  const cls = `mk${c.critical ? " crit" : ""}${c.confirmed ? " done" : ""}`;
  const ring = selected ? "outline:3px solid #14213d;outline-offset:2px;" : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    html: `<div class="${cls}" style="width:${size}px;height:${size}px;background:${bg};--glow:${main}47;--pulse:${main}8c;${ring}"><span>${c.count > 1 ? c.count : ""}</span></div>`,
  });
}

export default function MapView({
  clusters,
  threshold,
  selectedAnchor,
  onSelect,
  focus,
  home,
}: {
  clusters: MapCluster[];
  threshold: number;
  selectedAnchor: string | null;
  onSelect: (anchorId: string | null) => void;
  focus?: { lat: number; lng: number; at: number } | null;
  /** Where to open: the officer's assigned province (or Indonesia). undefined = still loading,
   *  null = unknown -> fall back to fitting the reports. */
  home?: { lat: number; lng: number; zoom: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const homed = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView(home ? [home.lat, home.lng] : INDONESIA, home ? home.zoom : 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on("click", () => onSelectRef.current(null));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const lg = layer.current;
    if (!m || !lg) return;
    lg.clearLayers();
    for (const c of clusters) {
      L.marker([c.lat, c.lng], {
        icon: iconFor(c, threshold, c.anchorId === selectedAnchor),
        keyboard: true,
        title: `${c.count} laporan`,
      })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(c.anchorId);
        })
        .addTo(lg);
    }
    // Only when the officer's area is unknown: frame the reports instead.
    if (home === null && !fitted.current && clusters.length) {
      m.fitBounds(L.latLngBounds(clusters.map((c) => [c.lat, c.lng] as L.LatLngTuple)).pad(0.3), { maxZoom: 15 });
      fitted.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, threshold, selectedAnchor]);

  // Open on the officer's assigned area once it is known (a ?focus= target from a notification wins).
  useEffect(() => {
    const m = map.current;
    if (!m || !home || homed.current) return;
    homed.current = true;
    if (!focus) m.setView([home.lat, home.lng], home.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  // Recenter when a focus target is requested (e.g. "Lihat di peta" / notif).
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.flyTo([focus.lat, focus.lng], Math.max(m.getZoom(), 15), { duration: 0.6 });
  }, [focus]);

  return <div ref={el} style={{ width: "100%", height: "100%" }} role="application" aria-label="Peta sebaran laporan" />;
}
