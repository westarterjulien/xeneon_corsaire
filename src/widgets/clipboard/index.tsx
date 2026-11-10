import { useState } from "react";
import { bridge, type Clip } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useNow, useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./clipboard.css";

interface Settings {
  paste: boolean;
  blur: boolean;
}

function ago(at: number, now: number) {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `il y a ${h} h` : "hier ou avant";
}

export default defineWidget<Settings>({
  type: "clipboard",
  name: "Presse-papiers",
  description: "Les derniers textes copiés : un toucher pour les recoller.",
  icon: "clipboard",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  settings: [
    { key: "paste", label: "Coller directement dans l'appli active", type: "boolean", default: true, help: "Sinon, le texte est seulement remis dans le presse-papiers." },
    { key: "blur", label: "Flouter le contenu (discrétion)", type: "boolean", default: false, help: "L'historique n'est jamais enregistré sur le disque : il disparaît en quittant l'appli." },
  ],
  component: ({ settings, size }) => {
    const { value: clips } = useShared<Clip[]>("clipboard", bridge.clipboardHistory, 1500);
    const now = useNow(30_000).getTime();
    const [done, setDone] = useState<number | null>(null);
    const items = (clips ?? []).slice(0, Math.max(2, size.h * 2 - 1));
    const use = async (c: Clip) => {
      setDone(c.id);
      window.setTimeout(() => setDone(null), 900);
      await bridge.clipboardUse(c.id, settings.paste).catch((e) => console.error("[presse-papiers]", e));
    };
    return (
      <div className={`clp ${settings.blur ? "is-blur" : ""}`}>
        <div className="clp-head">
          <Kicker>Presse-papiers</Kicker>
          {!!clips?.length && <button className="clp-clear" onClick={() => void bridge.clipboardClear()}>Effacer</button>}
        </div>
        {!items.length && <div className="clp-empty">Copie du texte (Ctrl+C) : il apparaîtra ici.</div>}
        <div className="clp-list">
          {items.map((c) => (
            <button key={c.id} className={`clp-item ${done === c.id ? "is-done" : ""}`} onClick={() => use(c)}>
              <span className="clp-text">{c.text.replace(/\s+/g, " ").trim()}</span>
              <span className="clp-meta">{done === c.id ? (settings.paste ? "Collé" : "Copié") : ago(c.at, now)}</span>
              <Icon name={done === c.id ? "zap" : "clipboard"} className="clp-icon" />
            </button>
          ))}
        </div>
      </div>
    );
  },
});
