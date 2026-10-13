// Neutral loader for the support console. The tabs header is painted by the
// layout and stays put; this only fills the body area, so switching between
// Laporan and Peta no longer flashes a differently-shaped skeleton.
export default function Loading() {
  return (
    <div className="support-loading" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>
      <span className="msym spin">progress_activity</span>
      <p>Memuat…</p>
    </div>
  );
}
