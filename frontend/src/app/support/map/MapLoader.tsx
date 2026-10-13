"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map must never render on the server.
const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => <div className="empty" style={{ margin: "auto" }}>Memuat peta…</div>,
});

export default function MapLoader() {
  return <MapClient />;
}
