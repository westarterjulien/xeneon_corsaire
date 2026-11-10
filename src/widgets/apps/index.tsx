import { useState, type CSSProperties } from "react";
import { bridge, type InstalledApp } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { defineWidget } from "../../sdk/types";
import { AppIcon } from "./AppIcon";
import { AppsPicker } from "./AppsPicker";
import "./apps.css";

interface Settings {
  title: string;
  apps: InstalledApp[];
  columns: number;
  showLabels: boolean;
}

/** Applis du menu Démarrer : shell:AppsFolder\<AppID> ; programmes ajoutés par chemin : le chemin. */
const target = (a: InstalledApp) => (/^[a-z]:\\/i.test(a.id) ? a.id : `shell:AppsFolder\\${a.id}`);

export default defineWidget<Settings>({
  type: "apps",
  name: "Applications",
  description: "Tes logiciels en un toucher, avec leurs vraies icônes.",
  icon: "grid",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 1, h: 1 },
  settings: [
    { key: "apps", label: "Logiciels", type: "custom", default: [], editor: AppsPicker },
    { key: "title", label: "Titre", type: "text", default: "" },
    { key: "columns", label: "Colonnes", type: "number", default: 4, min: 1, max: 12 },
    { key: "showLabels", label: "Afficher les noms", type: "boolean", default: true },
  ],
  component: ({ settings }) => {
    const [flash, setFlash] = useState<string | null>(null);
    const apps = Array.isArray(settings.apps) ? settings.apps : [];
    if (!apps.length) {
      return (
        <div className="aps aps-empty">
          <Kicker>Applications</Kicker>
          <div className="aps-help">Ajoute tes logiciels dans les réglages du widget (⚙ ou Studio).</div>
        </div>
      );
    }
    const cols = Math.max(1, Math.min(apps.length, settings.columns || 1));
    const rows = Math.ceil(apps.length / cols);
    const launch = async (a: InstalledApp) => {
      setFlash(a.id);
      window.setTimeout(() => setFlash(null), 500);
      await bridge.runAction({ kind: "open", target: target(a) }).catch((e) => console.error("[applications]", e));
    };
    return (
      <div className={`aps ${settings.showLabels ? "" : "no-labels"}`} style={{ "--cols": cols, "--rows": rows } as CSSProperties}>
        {settings.title && <Kicker>{settings.title}</Kicker>}
        <div className="aps-grid">
          {apps.map((a) => (
            <button key={a.id} className={`aps-btn ${flash === a.id ? "is-flash" : ""}`} onClick={() => launch(a)} title={a.name}>
              <AppIcon app={a} size="var(--s)" />
              {settings.showLabels && <span className="aps-label">{a.name}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  },
});
