import type { CSSProperties, ReactNode } from "react";

/** Icônes au trait (24×24). `filled` = formes pleines (lecture, pause…). */
const paths: Record<string, { d: ReactNode; filled?: boolean }> = {
  play: { filled: true, d: <path d="M7 4.5v15l13-7.5z" /> },
  pause: { filled: true, d: <><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></> },
  next: { filled: true, d: <><path d="M5 5l10 7-10 7z" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" /></> },
  prev: { filled: true, d: <><path d="M19 5L9 12l10 7z" /><rect x="5" y="5" width="2.5" height="14" rx="1" /></> },
  volume: { d: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" /></> },
  "volume-down": { d: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9a4 4 0 0 1 0 6" /></> },
  mute: { d: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></> },
  mic: { d: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></> },
  "mic-off": { d: <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5 2.2M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /> },
  camera: { d: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></> },
  folder: { d: <path d="M3 6.5h6l2 2h10V19H3z" /> },
  globe: { d: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3.2 3.3 3.2 14.7 0 18M12 3c-3.2 3.3-3.2 14.7 0 18" /></> },
  chat: { d: <><path d="M4 5h16v11H10l-6 4z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" /></> },
  calculator: { d: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></> },
  record: { d: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></> },
  clip: { d: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" /></> },
  layers: { d: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></> },
  gamepad: { d: <><path d="M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L14 15h-4l-.7.6A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4z" /><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" /></> },
  music: { d: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></> },
  terminal: { d: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></> },
  home: { d: <path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" /> },
  link: { d: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /> },
  arrow: { d: <path d="M5 12h14M13 6l6 6-6 6" /> },
  power: { d: <path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" /> },
  lock: { d: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></> },
  edit: { d: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /> },
  settings: { d: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></> },
  close: { d: <path d="M6 6l12 12M18 6L6 18" /> },
  plus: { d: <path d="M12 5v14M5 12h14" /> },
  chevronLeft: { d: <path d="M15 5l-7 7 7 7" /> },
  chevronRight: { d: <path d="M9 5l7 7-7 7" /> },
  clock: { d: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  activity: { d: <path d="M3 12h4l3-8 4 16 3-8h4" /> },
  zap: { d: <path d="M13 2L4 14h7l-1 8 9-12h-7z" /> },
  mouse: { d: <><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></> },
  keyboard: { d: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></> },
  headset: { d: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></> },
  battery: { d: <><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 11v2" /></> },
  grid: { d: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></> },
  sliders: { d: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" /> },
  bulb: { d: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></> },
  thermo: { d: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 11v6" /></> },
  drop: { d: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /> },
  wifi: { d: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><path d="M12 19.5h.01" /></> },
  down: { d: <path d="M12 4v16M6 14l6 6 6-6" /> },
  up: { d: <path d="M12 20V4M6 10l6-6 6 6" /> },
  clipboard: { d: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4" /></> },
  user: { d: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
  search: { d: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></> },
  sun: { d: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></> },
  moon: { d: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /> },
  partly: { d: <><path d="M9 3.5v1.5M3.5 9H5M5.1 5.1l1 1M13 5.1l-1 1" /><path d="M6.6 11a3.5 3.5 0 0 1 6-3.2" /><path d="M8 20a3.5 3.5 0 1 1 .8-6.9A4.8 4.8 0 0 1 18 14.5 3 3 0 0 1 17.5 20.5H8" /></> },
  cloud: { d: <path d="M7 18a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 12 3.5 3.5 0 0 1 17.5 19H7" /> },
  rain: { d: <><path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 9 3.5 3.5 0 0 1 17.5 16H7" /><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2" /></> },
  snow: { d: <><path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 9 3.5 3.5 0 0 1 17.5 16H7" /><path d="M8 19.5h.01M12 18.5h.01M16 19.5h.01M10 21.5h.01M14 21.5h.01" /></> },
  storm: { d: <><path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 9 3.5 3.5 0 0 1 17.5 16H16" /><path d="M12.5 13l-2.5 4h3l-2 4" /></> },
  fog: { d: <path d="M4 9h16M6 13h12M4 17h16" /> },
};

export const iconNames = Object.keys(paths);

export function Icon({ name, size, style, className = "" }: { name: string; size?: number | string; style?: CSSProperties; className?: string }) {
  const p = paths[name];
  if (!p) return <span className={`icon-text ${className}`} style={{ fontSize: size, ...style }}>{name}</span>;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon ${className}`}
      style={{ width: size ?? "1em", height: size ?? "1em", ...style }}
      fill={p.filled ? "currentColor" : "none"}
      stroke={p.filled ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {p.d}
    </svg>
  );
}
