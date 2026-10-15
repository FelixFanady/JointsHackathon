
type Variant = "stats" | "reports" | "table" | "form" | "map";

const Sk = ({ w, h, r, mb, style }: { w: number | string; h: number; r?: number; mb?: number; style?: React.CSSProperties }) => (
  <span className="skeleton" style={{ width: w, height: h, borderRadius: r, marginBottom: mb, ...style }} />
);

function Stats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid-stats">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="stat">
          <Sk w={110} h={12} mb={14} />
          <Sk w={64} h={30} />
        </div>
      ))}
    </div>
  );
}

function Rows({ n = 6 }: { n?: number }) {
  return (
    <div className="card" style={{ marginTop: 16, padding: 20 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0" }}>
          <Sk w={36} h={36} r={9999} style={{ flex: "none" }} />
          <div style={{ flex: 1 }}>
            <Sk w={`${55 + ((i * 13) % 30)}%`} h={14} mb={8} />
            <Sk w={`${30 + ((i * 17) % 25)}%`} h={11} />
          </div>
          <Sk w={70} h={22} r={9999} style={{ flex: "none" }} />
        </div>
      ))}
    </div>
  );
}

function Toolbar() {
  return (
    <div className="toolbar">
      <Sk w={260} h={48} r={9999} />
      <Sk w="auto" h={48} r={16} style={{ flex: 1, minWidth: 220 }} />
      <Sk w={48} h={48} r={12} />
    </div>
  );
}

function Reports() {
  return (
    <>
      <div className="report-stats" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat" style={{ cursor: "default" }}>
            <Sk w={40} h={26} mb={6} />
            <Sk w={80} h={12} />
          </div>
        ))}
      </div>
      <Toolbar />
      <div className="report-list">
        <div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rcard skel" style={{ cursor: "default" }}>
              <Sk w="40%" h={14} />
              <Sk w="70%" h={20} style={{ marginTop: 10 }} />
              <Sk w="90%" h={14} style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Form() {
  return (
    <div className="card" style={{ marginTop: 16, padding: 24, maxWidth: 640 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <Sk w={160} h={14} mb={10} />
          <Sk w="100%" h={52} r={16} />
        </div>
      ))}
      <Sk w={140} h={44} r={9999} />
    </div>
  );
}

export default function RouteSkeleton({
  eyebrow,
  title,
  desc,
  variant,
}: {
  eyebrow?: string;
  title?: string;
  desc?: boolean;
  variant: Variant;
}) {
  if (variant === "map") {
    return (
      <div className="map-flush" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Memuat peta…</span>
        <span className="skeleton" style={{ flex: 1, borderRadius: 16, minHeight: 320 }} />
      </div>
    );
  }
  return (
    <div className="page" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat {title ?? "halaman"}…</span>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 220 }}>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : <Sk w={90} h={12} mb={10} />}
          {title ? <h1>{title}</h1> : <Sk w={240} h={28} mb={10} />}
          {desc !== false && <Sk w="min(520px, 90%)" h={14} style={{ marginTop: 6 }} />}
        </div>
      </div>
      {variant === "stats" && (<><Stats /><Rows /></>)}
      {variant === "reports" && <Reports />}
      {variant === "table" && (<><Toolbar /><Rows n={8} /></>)}
      {variant === "form" && <Form />}
    </div>
  );
}
