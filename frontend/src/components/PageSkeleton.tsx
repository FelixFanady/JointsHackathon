// Shown by loading.tsx while a page's server data loads, so navigation feels instant instead of frozen.
export default function PageSkeleton() {
  return (
    <div className="page" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="skeleton" style={{ width: 90, height: 12, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: 240, height: 28, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "min(520px, 90%)", height: 14 }} />
        </div>
      </div>

      <div className="grid-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat">
            <div className="skeleton" style={{ width: 110, height: 12, marginBottom: 14 }} />
            <div className="skeleton" style={{ width: 64, height: 30 }} />
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0" }}>
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 9999, flex: "none" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: `${55 + ((i * 13) % 30)}%`, height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: `${30 + ((i * 17) % 25)}%`, height: 11 }} />
            </div>
            <div className="skeleton" style={{ width: 70, height: 22, borderRadius: 9999, flex: "none" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
