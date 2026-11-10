import { useState, type KeyboardEvent } from "react";
import type { Action, MediaCommand } from "../../bridge";
import { IconPicker } from "../../core/IconPicker";
import { Icon } from "../../sdk/icons";
import { usePages } from "../../sdk/page";
import type { SettingEditorProps } from "../../sdk/types";

export interface Shortcut {
  label: string;
  /** Nom d'icône (voir sdk/icons.tsx) ou court texte. */
  icon?: string;
  action: Action;
}

const KINDS: { kind: Action["kind"]; label: string }[] = [
  { kind: "open", label: "Ouvrir" },
  { kind: "keys", label: "Touches" },
  { kind: "command", label: "Commande" },
  { kind: "media", label: "Média" },
  { kind: "page", label: "Page" },
];

const MEDIA: { value: MediaCommand; label: string }[] = [
  { value: "play_pause", label: "Lecture / pause" },
  { value: "next", label: "Piste suivante" },
  { value: "previous", label: "Piste précédente" },
  { value: "volume_up", label: "Monter le volume" },
  { value: "volume_down", label: "Baisser le volume" },
  { value: "mute", label: "Couper le son" },
];

const MODIFIERS = [
  { key: "ctrl", label: "Ctrl" },
  { key: "shift", label: "Maj" },
  { key: "alt", label: "Alt" },
  { key: "win", label: "Win" },
];

function defaultAction(kind: Action["kind"]): Action {
  switch (kind) {
    case "open": return { kind, target: "" };
    case "keys": return { kind, keys: "" };
    case "command": return { kind, command: "" };
    case "media": return { kind, command: "play_pause" };
    case "page": return { kind, page: 0 };
  }
}

const KEY_NAMES: Record<string, string> = {
  Enter: "enter", Escape: "esc", Tab: "tab", " ": "space", Backspace: "backspace", Delete: "delete", Insert: "insert",
  Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  PrintScreen: "printscreen", MediaPlayPause: "play_pause", MediaTrackNext: "next", MediaTrackPrevious: "previous",
  AudioVolumeUp: "volume_up", AudioVolumeDown: "volume_down", AudioVolumeMute: "mute",
};

/** Nom de touche compris par le backend (keys.rs). Lettres selon la disposition du clavier, chiffres selon leur position. */
function keyName(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"].includes(e.key)) return null;
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toLowerCase();
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  if (e.code.startsWith("Digit")) return e.code.slice(5);
  if (e.code.startsWith("Numpad") && /\d$/.test(e.code)) return e.code.slice(-1);
  return KEY_NAMES[e.key] ?? null;
}

const pretty = (k: string) => (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
export const formatCombo = (keys: string) =>
  keys
    .split("+")
    .filter(Boolean)
    .map((k) => MODIFIERS.find((m) => m.key === k)?.label ?? pretty(k))
    .join(" + ");

function KeyRecorder({ value, onChange }: { value: string; onChange: (keys: string) => void }) {
  const parts = value.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const mods = new Set(parts.filter((p) => MODIFIERS.some((m) => m.key === p)));
  const key = parts.find((p) => !MODIFIERS.some((m) => m.key === p)) ?? "";
  const [listening, setListening] = useState(false);
  const build = (m: Set<string>, k: string) => [...MODIFIERS.map((x) => x.key).filter((x) => m.has(x)), k].filter(Boolean).join("+");

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab" && !e.ctrlKey && !e.altKey) return;
    e.preventDefault();
    const k = keyName(e);
    if (!k) return;
    const m = new Set(mods);
    if (e.ctrlKey) m.add("ctrl");
    if (e.shiftKey) m.add("shift");
    if (e.altKey) m.add("alt");
    if (e.metaKey) m.add("win");
    onChange(build(m, k));
    setListening(false);
  };

  return (
    <div className="keyrec">
      <div className="keyrec-mods">
        {MODIFIERS.map((m) => (
          <button key={m.key} type="button" className={`chip ${mods.has(m.key) ? "is-active" : ""}`} onClick={() => {
            const next = new Set(mods);
            if (next.has(m.key)) next.delete(m.key); else next.add(m.key);
            onChange(build(next, key));
          }}>{m.label}</button>
        ))}
        <span className="keyrec-plus">+</span>
        <div
          tabIndex={0}
          role="textbox"
          aria-label="Touche"
          className={`keyrec-key ${listening ? "is-listening" : ""}`}
          onFocus={() => setListening(true)}
          onBlur={() => setListening(false)}
          onKeyDown={onKeyDown}
        >
          {listening ? "Appuie sur une touche…" : key ? pretty(key) : "Touche"}
        </div>
      </div>
      <div className="form-help">
        {value ? <>Combinaison : <b>{formatCombo(value)}</b>. </> : null}
        Tape la combinaison au clavier dans la case « Touche » ; les modificateurs se règlent aussi d'un toucher (Win n'est capturable qu'ainsi).
      </div>
    </div>
  );
}

export function summary(a: Action | undefined): string {
  if (!a) return "Aucune action";
  switch (a.kind) {
    case "open": return a.target || "À configurer";
    case "keys": return a.keys ? formatCombo(a.keys) : "À configurer";
    case "command": return a.command || "À configurer";
    case "media": return MEDIA.find((m) => m.value === a.command)?.label ?? a.command;
    case "page": return `Page ${a.page + 1}`;
  }
}

function ActionForm({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const pages = usePages();
  return (
    <>
      <div className="segmented">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className={action.kind === k.kind ? "is-active" : ""} onClick={() => action.kind !== k.kind && onChange(defaultAction(k.kind))}>{k.label}</button>
        ))}
      </div>
      {action.kind === "open" && (
        <>
          <input type="text" value={action.target} placeholder="https://… · C:\Program Files\…\app.exe · steam://rungameid/…" onChange={(e) => onChange({ ...action, target: e.target.value })} />
          <span className="form-help">Une adresse web, un programme, un fichier, un dossier ou un lien d'appli (steam://, discord://, spotify:…).</span>
        </>
      )}
      {action.kind === "keys" && <KeyRecorder value={action.keys} onChange={(keys) => onChange({ ...action, keys })} />}
      {action.kind === "command" && (
        <>
          <input type="text" value={action.command} placeholder="ex. shutdown /s /t 0" onChange={(e) => onChange({ ...action, command: e.target.value })} />
          <span className="form-help">Exécutée par cmd.exe, sans fenêtre.</span>
        </>
      )}
      {action.kind === "media" && (
        <select value={action.command} onChange={(e) => onChange({ ...action, command: e.target.value as MediaCommand })}>
          {MEDIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )}
      {action.kind === "page" && (
        <select value={action.page} onChange={(e) => onChange({ ...action, page: Number(e.target.value) })}>
          {pages.names.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
      )}
    </>
  );
}

export function ShortcutsEditor({ value, onChange }: SettingEditorProps) {
  const buttons = (Array.isArray(value) ? value : []) as Shortcut[];
  const [sel, setSel] = useState<number | null>(buttons.length ? 0 : null);
  const current = sel != null ? buttons[sel] : undefined;

  const update = (i: number, patch: Partial<Shortcut>) => onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= buttons.length) return;
    const next = [...buttons];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setSel(j);
  };
  const remove = (i: number) => {
    onChange(buttons.filter((_, j) => j !== i));
    setSel(buttons.length > 1 ? Math.max(0, i - 1) : null);
  };
  const add = () => {
    onChange([...buttons, { label: "Nouveau", icon: "zap", action: { kind: "open", target: "" } }]);
    setSel(buttons.length);
  };

  return (
    <div className="sce">
      <div className="sce-list">
        {buttons.map((b, i) => (
          <button key={i} type="button" className={`sce-item ${sel === i ? "is-active" : ""}`} onClick={() => setSel(i)}>
            <span className="sce-ico">{b.icon ? <Icon name={b.icon} /> : b.label.slice(0, 1)}</span>
            <span className="sce-text">
              <span className="sce-name">{b.label || "Sans nom"}</span>
              <span className="sce-sum">{summary(b.action)}</span>
            </span>
          </button>
        ))}
        <button type="button" className="sce-add" onClick={add}><Icon name="plus" /> Ajouter un bouton</button>
      </div>

      {current && sel != null && (
        <div className="sce-form">
          <div className="sce-row">
            <input type="text" className="sce-label" value={current.label} placeholder="Libellé" onChange={(e) => update(sel, { label: e.target.value })} />
            <button type="button" className="icon-btn" onClick={() => move(sel, -1)} disabled={sel === 0} aria-label="Monter"><Icon name="chevronLeft" style={{ transform: "rotate(90deg)" }} /></button>
            <button type="button" className="icon-btn" onClick={() => move(sel, 1)} disabled={sel === buttons.length - 1} aria-label="Descendre"><Icon name="chevronRight" style={{ transform: "rotate(90deg)" }} /></button>
            <button type="button" className="icon-btn danger" onClick={() => remove(sel)} aria-label="Supprimer"><Icon name="close" /></button>
          </div>
          <span className="form-label">Action</span>
          <ActionForm action={current.action ?? defaultAction("open")} onChange={(action) => update(sel, { action })} />
          <span className="form-label">Icône</span>
          <IconPicker value={current.icon} onChange={(icon) => update(sel, { icon })} />
        </div>
      )}
    </div>
  );
}
