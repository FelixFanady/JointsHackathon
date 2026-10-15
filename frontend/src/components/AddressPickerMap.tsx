"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Pin = { lat: number; lng: number };

const JAKARTA: L.LatLngTuple = [-6.2088, 106.8456];

const pinIcon = () =>
  L.divIcon({
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    html: '<div class="pick-pin"><span class="msym" style="font-size:22px">location_on</span></div>',
  });

export default function AddressPickerMap({
  pin,
  fly,
  onPick,
}: {
  pin: Pin | null;
  fly: (Pin & { at: number }) | null;
  onPick: (p: Pin) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const place = (p: Pin) => {
    const m = map.current;
    if (!m) return;
    if (marker.current) marker.current.setLatLng([p.lat, p.lng]);
    else {
      marker.current = L.marker([p.lat, p.lng], { icon: pinIcon(), draggable: true, keyboard: true, title: "Geser untuk memindahkan titik" })
        .on("dragend", () => {
          const ll = marker.current!.getLatLng();
          pickRef.current({ lat: ll.lat, lng: ll.lng });
        })
        .addTo(m);
    }
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const start = pin ? ([pin.lat, pin.lng] as L.LatLngTuple) : JAKARTA;
    const m = L.map(el.current, { zoomControl: true }).setView(start, pin ? 16 : 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      place(p);
      pickRef.current(p);
    });
    map.current = m;
    if (pin) place(pin);
    const t = window.setTimeout(() => m.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fly && map.current) map.current.flyTo([fly.lat, fly.lng], 16, { duration: 0.6 });
  }, [fly]);

  return <div ref={el} className="pick-map" role="application" aria-label="Peta untuk memilih alamat. Klik untuk menaruh pin." />;
}
