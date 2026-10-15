"use client";

import dynamic from "next/dynamic";
import RouteSkeleton from "@/components/RouteSkeleton";

const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => <RouteSkeleton variant="map" />,
});

export default function MapLoader() {
  return <MapClient />;
}
