import { useState, type CSSProperties } from "react";
import { Kicker } from "../../sdk/components";
import { Icon } from "../../sdk/icons";
import { usePages } from "../../sdk/page";
import { defineWidget } from "../../sdk/types";
import { DeckEditor } from "./DeckEditor";
import { FaceVisual } from "./face";
import { atPath, DEFAULT_DECK, onColor, runSteps, type ButtonFace, type DeckButton } from "./model";
import "./deck.css";

interface Settings {
  title: string;
  columns: number;
  buttons: DeckButton[];
  /** Boutons à deux états actuellement sur leur second état. */
  states: Record<string, boolean>;
}

function Face({ face, folder }: { face: ButtonFace; folder?: boolean }) {
  const filled = !!face.color;
  return (
    <>
      <span
        className={`dk-circle ${filled ? "is-filled" : ""}`}
        style={filled ? ({ "--tint": face.color, color: onColor(face.color) } as CSSProperties) : undefined}
      >
        <FaceVisual face={face} size="calc(var(--s) * .5)" />
        {folder && <span className="dk-folder-dot" />}
      </span>
      <span className="dk-label">{face.label}</span>
    </>
  );
}

export default defineWidget<Settings>({
  type: "deck",
  name: "Deck",
  description: "Façon Stream Deck : actions en chaîne, boutons à deux états, dossiers.",
  icon: "grid",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 1, h: 1 },
  settings: [
    { key: "buttons", label: "Boutons", type: "custom", default: DEFAULT_DECK, editor: DeckEditor },
    { key: "title", label: "Titre", type: "text", default: "Deck" },
    { key: "columns", label: "Colonnes", type: "number", default: 3, min: 1, max: 12 },
  ],
  component: ({ settings, updateSettings }) => {
    const pages = usePages();
    const [path, setPath] = useState<string[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const root = Array.isArray(settings.buttons) ? settings.buttons : [];
    const list = atPath(root, path);
    const states = settings.states ?? {};
    const cols = Math.max(1, settings.columns || 3);
    const count = list.length + (path.length ? 1 : 0);
    const rows = Math.max(1, Math.ceil(count / cols));

    const press = async (b: DeckButton) => {
      if (b.children) {
        setPath([...path, b.id]);
        return;
      }
      const second = !!b.alt && !!states[b.id];
      setBusy(b.id);
      try {
        await runSteps(second ? b.alt!.steps : b.steps, pages.goTo);
        if (b.alt) updateSettings({ states: { ...states, [b.id]: !second } });
      } catch (e) {
        console.error("[deck]", b.label, e);
        setFailed(b.id);
        window.setTimeout(() => setFailed(null), 1200);
      } finally {
        setBusy(null);
      }
    };

    return (
      <div className="dk" style={{ "--cols": cols, "--rows": rows } as CSSProperties}>
        {settings.title && !path.length && <Kicker>{settings.title}</Kicker>}
        {path.length > 0 && <Kicker>{atPath(root, path.slice(0, -1)).find((b) => b.id === path[path.length - 1])?.label ?? "Dossier"}</Kicker>}
        <div className="dk-grid">
          {path.length > 0 && (
            <button className="dk-btn dk-back" onClick={() => setPath(path.slice(0, -1))}>
              <span className="dk-circle"><Icon name="chevronLeft" /></span>
              <span className="dk-label">Retour</span>
            </button>
          )}
          {list.map((b) => {
            const second = !!b.alt && !!states[b.id];
            const face: ButtonFace = second ? { ...b, ...b.alt } : b;
            return (
              <button key={b.id} className={`dk-btn ${second ? "is-on" : ""} ${busy === b.id ? "is-busy" : ""} ${failed === b.id ? "is-err" : ""}`} onClick={() => press(b)}>
                <Face face={face} folder={!!b.children} />
              </button>
            );
          })}
        </div>
      </div>
    );
  },
});
