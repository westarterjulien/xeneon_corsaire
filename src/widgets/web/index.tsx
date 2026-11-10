import { useEffect, useState } from "react";
import { defineWidget } from "../../sdk/types";

interface Settings {
  url: string;
  zoom: number;
  reloadMinutes: number;
}

export default defineWidget<Settings>({
  type: "web",
  name: "Page web",
  description: "Intègre une page : Home Assistant, Grafana, tableau de bord…",
  icon: "globe",
  defaultSize: { w: 8, h: 4 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: "url", label: "Adresse", type: "text", default: "https://open-meteo.com/", help: "Certains sites interdisent l'intégration (X-Frame-Options)." },
    { key: "zoom", label: "Zoom (%)", type: "number", default: 100, min: 25, max: 300, step: 5 },
    { key: "reloadMinutes", label: "Recharger toutes les (min, 0 = jamais)", type: "number", default: 0, min: 0 },
  ],
  component: ({ settings }) => {
    const [nonce, setNonce] = useState(0);
    useEffect(() => {
      if (!settings.reloadMinutes) return;
      const id = window.setInterval(() => setNonce((n) => n + 1), settings.reloadMinutes * 60_000);
      return () => window.clearInterval(id);
    }, [settings.reloadMinutes]);
    const z = (settings.zoom || 100) / 100;
    if (!settings.url) return <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--muted)" }}>Renseigne une adresse dans les réglages.</div>;
    return (
      <iframe
        key={nonce}
        src={settings.url}
        title="web"
        style={{ border: 0, borderRadius: 16, width: `${100 / z}%`, height: `${100 / z}%`, transform: `scale(${z})`, transformOrigin: "0 0", background: "#fff" }}
        allow="autoplay; fullscreen"
      />
    );
  },
});
