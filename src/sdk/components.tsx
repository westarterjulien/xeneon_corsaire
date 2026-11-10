import { useId, type CSSProperties, type ReactNode } from "react";

/** Anneau fin 0–100, la valeur est dessinée dans le SVG pour suivre la taille du conteneur. */
export function RingGauge({ value, label, sub, unit = "%", color = "var(--accent)" }: { value: number | null; label: string; sub?: ReactNode; unit?: string; color?: string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring">
      <svg viewBox="0 0 150 150" aria-hidden>
        <circle cx="75" cy="75" r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
        <circle
          cx="75" cy="75" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 75 75)"
          style={{ transition: "stroke-dasharray .8s ease" }}
        />
        <text x="75" y="77" textAnchor="middle" dominantBaseline="middle" className="ring-value">
          {value == null ? "—" : Math.round(value)}
          {value != null && <tspan className="ring-unit" dx="2">{unit}</tspan>}
        </text>
      </svg>
      <div className="ring-label">{label}</div>
      {sub != null && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

/** Courbe fine avec dégradé, historique de valeurs (0–max). */
export function Sparkline({ values, max = 100, color = "var(--accent)", height = 100, style }: { values: number[]; max?: number; color?: string; height?: number | string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const w = 400;
  const h = 100;
  if (values.length < 2) return <div style={{ height, ...style }} />;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(v, max) / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", ...style }} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#g${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Petit titre en capitales espacées, en tête de widget. */
export const Kicker = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div className="kicker" style={style}>{children}</div>;

export const formatBytes = (b: number) => `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} Go`;
export const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
