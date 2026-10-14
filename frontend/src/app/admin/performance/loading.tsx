import RouteSkeleton from "@/components/RouteSkeleton";

// Shown instantly on navigation while this page's data loads (real title + skeleton).
export default function Loading() {
  return <RouteSkeleton eyebrow="Admin Panel" title="Performa Support" variant="stats" />;
}
