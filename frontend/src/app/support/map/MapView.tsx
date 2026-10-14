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
};

const JAKARTA: L.LatLngTuple = [-6.2088, 106.8456];

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function iconFor(c: MapCluster, threshold: number, selected: boolean) {
  const t = Math.min(1, c.count / Math.max(threshold, 2));
  // light red -> deep red: the more reports, the redder the point
  const [r, g, b] = mix([252, 165, 165], [153, 27, 27], t);
  const size = 26 + Math.round(t * 26);
  const glow = `rgba(${r},${g},${b},0.28)`;
  const cls = `mk${c.critical ? " crit" : ""}${c.confirmed ? " done" : ""}`;
  const ring = selected ? "outline:3px solid #14213d;outline-offset:2px;" : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    html: `<div class="${cls}" style="width:${size}px;height:${size}px;background:rgb(${r},${g},${b});--glow:${glow};${ring}">${c.count > 1 ? c.count : ""}</div>`,
  });
}

export default function MapView({
  clusters,
  threshold,
  selectedAnchor,
  onSelect,
  focus,
}: {
  clusters: MapCluster[];
  threshold: number;
  selectedAnchor: string | null;
  onSelect: (anchorId: string | null) => void;
  focus?: { lat: number; lng: number; at: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView(JAKARTA, 12);
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
    if (!fitted.current && clusters.length) {
      m.fitBounds(L.latLngBounds(clusters.map((c) => [c.lat, c.lng] as L.LatLngTuple)).pad(0.3), { maxZoom: 15 });
      fitted.current = true;
    }
  }, [clusters, threshold, selectedAnchor]);

  // Recenter when a focus target is requested (e.g. "Lihat di peta" / notif).
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    m.flyTo([focus.lat, focus.lng], Math.max(m.getZoom(), 15), { duration: 0.6 });
  }, [focus]);

  return <div ref={el} style={{ width: "100%", height: "100%" }} role="application" aria-label="Peta sebaran laporan" />;
}
