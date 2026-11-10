import { useState, type CSSProperties } from "react";
import { bridge } from "../../bridge";
import { defineWidget } from "../../sdk/types";
import { usePages } from "../../sdk/page";
import { Icon } from "../../sdk/icons";
import { Kicker } from "../../sdk/components";
import { ShortcutsEditor, type Shortcut } from "./ShortcutsEditor";
import "./shortcuts.css";

interface Settings {
  title: string;
  columns: number;
  buttons: Shortcut[];
}

const DEFAULT_BUTTONS: Shortcut[] = [
  { label: "Micro", icon: "mic", action: { kind: "keys", keys: "ctrl+shift+m" } },
  { label: "Capture", icon: "camera", action: { kind: "keys", keys: "win+shift+s" } },
  { label: "Discord", icon: "chat", action: { kind: "open", target: "discord://" } },
  { label: "Fichiers", icon: "folder", action: { kind: "keys", keys: "win+e" } },
  { label: "Navigateur", icon: "globe", action: { kind: "open", target: "https://www.google.com" } },
  { label: "Calculer", icon: "calculator", action: { kind: "command", command: "calc.exe" } },
];

export default defineWidget<Settings>({
  type: "shortcuts",
  name: "Raccourcis",
  description: "Applis, URL, combinaisons de touches, scripts, pages.",
  icon: "zap",
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 1, h: 1 },
  settings: [
    { key: "title", label: "Titre", type: "text", default: "Raccourcis" },
    { key: "columns", label: "Colonnes", type: "number", default: 2, min: 1, max: 12 },
    { key: "buttons", label: "Boutons", type: "custom", default: DEFAULT_BUTTONS, editor: ShortcutsEditor },
  ],
  component: ({ settings }) => {
    const pages = usePages();
    const [flash, setFlash] = useState<{ i: number; ok: boolean } | null>(null);
    const buttons = Array.isArray(settings.buttons) ? settings.buttons : [];
    const cols = Math.max(1, Math.min(buttons.length || 1, settings.columns || 1));
    const rows = Math.max(1, Math.ceil(buttons.length / cols));

    const run = async (b: Shortcut, i: number) => {
      let ok = true;
      try {
        if (b.action?.kind === "page") pages.goTo(b.action.page);
        else await bridge.runAction(b.action);
      } catch (e) {
        ok = false;
        console.error("[raccourci]", b.label, e);
      }
      setFlash({ i, ok });
      window.setTimeout(() => setFlash(null), 450);
    };

    return (
      <div className="sc" style={{ "--cols": cols, "--rows": rows } as CSSProperties}>
        {settings.title && <Kicker>{settings.title}</Kicker>}
        <div className="sc-grid">
          {buttons.map((b, i) => (
            <button key={i} className={`sc-btn ${flash?.i === i ? (flash.ok ? "is-ok" : "is-err") : ""}`} onClick={() => run(b, i)}>
              <span className="sc-circle">{b.icon ? <Icon name={b.icon} /> : b.label.slice(0, 1)}</span>
              <span className="sc-label">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  },
});
