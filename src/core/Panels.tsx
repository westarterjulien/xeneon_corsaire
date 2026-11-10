import { useEffect, useState, type ReactNode } from "react";
import { bridge, isTauri, type MonitorInfo } from "../bridge";
import { Icon } from "../sdk/icons";
import { isUserWidget, useRegistryVersion, useUserWidgetsInfo, widgetRegistry } from "../sdk/registry";
import type { SettingField, WidgetDefinition } from "../sdk/types";
import { IconPicker } from "./IconPicker";
import type { AppConfig, WidgetInstance } from "./layout";

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function PaletteItem({ d, onPick }: { d: WidgetDefinition; onPick: (type: string) => void }) {
  return (
    <button className="palette-item" onClick={() => onPick(d.type)}>
      <span className="palette-icon"><Icon name={d.icon} /></span>
      <span className="palette-name">{d.name}</span>
      <span className="palette-desc">{d.description}</span>
      <span className="palette-size">{d.defaultSize.w}×{d.defaultSize.h}</span>
    </button>
  );
}

/** Bibliothèque de widgets (intégrés + perso), utilisée par la palette de l'Edge et par le Studio. */
export function WidgetLibrary({ onPick, onReload, compact = false }: { onPick: (type: string) => void; onReload: () => void; compact?: boolean }) {
  useRegistryVersion();
  const info = useUserWidgetsInfo();
  const [message, setMessage] = useState<string | null>(null);
  const all = [...widgetRegistry.values()];
  const builtIn = all.filter((d) => !isUserWidget(d.type));
  const mine = all.filter((d) => isUserWidget(d.type));

  const create = async () => {
    const name = window.prompt("Nom du nouveau widget", "Mon widget");
    if (!name?.trim()) return;
    try {
      const id = await bridge.createUserWidget(name);
      onReload();
      if (info.dir) await bridge.runAction({ kind: "open", target: `${info.dir}\\${id}` });
      setMessage(`« ${name} » est créé : modifie son index.html, il se recharge tout seul.`);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const cls = `palette ${compact ? "is-compact" : ""}`;
  return (
    <>
      <div className="palette-section">Intégrés</div>
      <div className={cls}>{builtIn.map((d) => <PaletteItem key={d.type} d={d} onPick={onPick} />)}</div>

      <div className="palette-section">
        <span>Mes widgets</span>
      </div>
      <div className="palette-actions">
        <button className="link-btn" onClick={create}><Icon name="plus" /> Créer un widget</button>
        {isTauri && info.dir && (
          <button className="link-btn" onClick={() => bridge.runAction({ kind: "open", target: info.dir! })}><Icon name="folder" /> Ouvrir le dossier</button>
        )}
      </div>
      {mine.length > 0 ? (
        <div className={cls}>{mine.map((d) => <PaletteItem key={d.type} d={d} onPick={onPick} />)}</div>
      ) : (
        <p className="palette-empty">Aucun widget perso pour l'instant.</p>
      )}
      {info.errors.map((e) => (
        <p key={e.id} className="palette-error">{e.id} : {e.error}</p>
      ))}
      {message && <p className="palette-note">{message}</p>}
      <p className="palette-note">
        Un widget perso = un dossier avec <code>widget.json</code> et <code>index.html</code>
        {info.dir ? <> dans <code>{info.dir}</code></> : null}. Pas besoin de recompiler : chaque modification est rechargée en direct.
      </p>
    </>
  );
}

export function Palette({ onPick, onClose, onReload }: { onPick: (type: string) => void; onClose: () => void; onReload: () => void }) {
  return (
    <Sheet title="Ajouter un widget" onClose={onClose}>
      <WidgetLibrary onPick={onPick} onReload={onReload} />
    </Sheet>
  );
}

function Field({ field, value, settings, onChange, onPatch }: { field: SettingField; value: unknown; settings: Record<string, unknown>; onChange: (v: unknown) => void; onPatch: (p: Record<string, unknown>) => void }) {
  const [jsonText, setJsonText] = useState(() => (field.type === "json" ? JSON.stringify(value ?? field.default ?? null, null, 2) : ""));
  const [jsonError, setJsonError] = useState<string | null>(null);
  switch (field.type) {
    case "boolean":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return <input type="number" value={Number(value ?? field.default ?? 0)} min={field.min} max={field.max} step={field.step} onChange={(e) => onChange(Number(e.target.value))} />;
    case "select":
      return (
        <select value={String(value ?? field.default ?? "")} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "color":
      return <input type="color" value={String(value ?? field.default ?? "#a9c4ff")} onChange={(e) => onChange(e.target.value)} />;
    case "icon":
      return <IconPicker value={String(value ?? field.default ?? "")} onChange={onChange} />;
    case "custom": {
      const Editor = field.editor;
      return <Editor value={value ?? field.default} settings={settings} onChange={onChange} onPatch={onPatch} />;
    }
    case "json":
      return (
        <div className="json-field">
          <textarea
            spellCheck={false}
            rows={10}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              try {
                onChange(JSON.parse(e.target.value));
                setJsonError(null);
              } catch (err) {
                setJsonError((err as Error).message);
              }
            }}
          />
          {jsonError && <div className="field-error">JSON invalide : {jsonError}</div>}
        </div>
      );
    default:
      return <input type="text" value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

const WIDE = new Set(["json", "icon", "custom"]);

/** Formulaire généré à partir des réglages déclarés par le widget. */
export function SettingsForm({ def, settings: s, onChange }: { def: WidgetDefinition; settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  if (!def.settings?.length) return <p className="palette-empty">Ce widget n'a pas de réglages.</p>;
  return (
    <div className="form">
      {def.settings.map((f) => (
        // div plutôt que label : un label englobant redirigerait les clics des éditeurs riches.
        <div key={f.key} className={`form-row ${WIDE.has(f.type) ? "is-wide" : ""}`}>
          <span className="form-label">{f.label}</span>
          <Field field={f} value={s[f.key]} settings={s} onChange={(v) => onChange({ ...s, [f.key]: v })} onPatch={(p) => onChange({ ...s, ...p })} />
          {f.help && <span className="form-help">{f.help}</span>}
        </div>
      ))}
    </div>
  );
}

export function WidgetSettings({ instance, onChange, onClose }: { instance: WidgetInstance; onChange: (s: Record<string, unknown>) => void; onClose: () => void }) {
  useRegistryVersion();
  const def = widgetRegistry.get(instance.type);
  if (!def) return null;
  return (
    <Sheet title={<><Icon name={def.icon} /> {def.name}</>} onClose={onClose}>
      <SettingsForm def={def} settings={instance.settings} onChange={onChange} />
    </Sheet>
  );
}

export function AppSettings({ config, onChange, onClose }: { config: AppConfig; onChange: (c: AppConfig) => void; onClose: () => void }) {
  return (
    <Sheet title="Réglages" onClose={onClose}>
      <AppearanceForm config={config} onChange={onChange} />
    </Sheet>
  );
}

/** Couleurs et écran d'affichage. */
export function AppearanceForm({ config, onChange }: { config: AppConfig; onChange: (c: AppConfig) => void }) {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    bridge.monitors().then(setMonitors).catch(() => setMonitors([]));
    if (isTauri) bridge.autostartGet().then(setAutostart).catch(() => setAutostart(null));
  }, []);
  return (
      <div className="form">
        {autostart !== null && (
          <label className="form-row is-wide form-inline">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => {
                const v = e.target.checked;
                setAutostart(v);
                bridge.autostartSet(v).catch(() => setAutostart(!v));
              }}
            />
            <span>Lancer Edge Studio au démarrage de Windows</span>
          </label>
        )}
        {isTauri && (
          <label className="form-row is-wide form-inline">
            <input
              type="checkbox"
              checked={config.display.hideTaskbar}
              onChange={(e) => {
                const v = e.target.checked;
                onChange({ ...config, display: { ...config.display, hideTaskbar: v } });
                void bridge.taskbarSet(v);
              }}
            />
            <span>Masquer la barre des tâches Windows sur l'Edge</span>
          </label>
        )}
        <label className="form-row">
          <span className="form-label">Couleur d'accent</span>
          <input type="color" value={config.theme.accent} onChange={(e) => onChange({ ...config, theme: { ...config.theme, accent: e.target.value } })} />
        </label>
        <label className="form-row">
          <span className="form-label">Fond</span>
          <input type="color" value={config.theme.background} onChange={(e) => onChange({ ...config, theme: { ...config.theme, background: e.target.value } })} />
        </label>
        <div className="form-row is-wide">
          <span className="form-label">Écran d'affichage</span>
          <div className="monitor-list">
            {monitors.map((m) => {
              const active = config.display.monitor ? config.display.monitor === m.name : m.isEdge;
              return (
                <button
                  key={`${m.name}-${m.x}`}
                  className={`chip ${active ? "is-active" : ""}`}
                  onClick={() => {
                    if (!m.name) return;
                    onChange({ ...config, display: { ...config.display, monitor: m.name } });
                    void bridge.moveToMonitor(m.name);
                  }}
                >
                  {m.name ?? "Écran"} · {m.width}×{m.height}
                  {m.isEdge ? " · Edge" : ""}
                </button>
              );
            })}
          </div>
          <span className="form-help">Par défaut, l'écran au format 2560×720 est choisi automatiquement.</span>
        </div>
      </div>
  );
}
