import { useMemo, useState } from "react";
import { bridge, isTauri, type InstalledApp } from "../../bridge";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps } from "../../sdk/types";
import { AppIcon } from "./AppIcon";

/** Choix des logiciels : recherche parmi les applis installées, ou chemin d'un programme. */
export function AppsPicker({ value, onChange }: SettingEditorProps) {
  const chosen = (Array.isArray(value) ? value : []) as InstalledApp[];
  const { value: installed, error } = useShared<InstalledApp[]>("installed-apps", bridge.installedApps, 300_000);
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (installed ?? []).filter((a) => !chosen.some((c) => c.id === a.id));
    return (q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list).slice(0, 24);
  }, [installed, query, chosen]);

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const addPath = () => {
    const p = path.trim().replace(/^"|"$/g, "");
    if (!/^[a-z]:\\.+/i.test(p)) return;
    const name = p.split("\\").pop()!.replace(/\.(exe|lnk|bat|cmd)$/i, "");
    onChange([...chosen, { id: p, name }]);
    setPath("");
  };

  return (
    <div className="apk">
      {chosen.length > 0 && (
        <div className="apk-chosen">
          {chosen.map((a, i) => (
            <div key={a.id} className="apk-item">
              <AppIcon app={a} size={34} />
              <input className="apk-name" value={a.name} onChange={(e) => onChange(chosen.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))} aria-label="Nom affiché" />
              <button type="button" className="apk-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter"><Icon name="chevronLeft" style={{ transform: "rotate(90deg)" }} /></button>
              <button type="button" className="apk-btn" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label="Descendre"><Icon name="chevronRight" style={{ transform: "rotate(90deg)" }} /></button>
              <button type="button" className="apk-btn danger" onClick={() => onChange(chosen.filter((_, j) => j !== i))} aria-label="Retirer"><Icon name="close" /></button>
            </div>
          ))}
        </div>
      )}

      <input type="text" value={query} placeholder="Chercher un logiciel installé…" onChange={(e) => setQuery(e.target.value)} />
      {!installed && !error && <span className="form-help">Lecture des applis installées…</span>}
      {error && <span className="field-error">Liste indisponible : {error}</span>}
      <div className="apk-results">
        {results.map((a) => (
          <button key={a.id} type="button" className="apk-result" onClick={() => onChange([...chosen, a])}>
            <AppIcon app={a} size={28} />
            <span>{a.name}</span>
            <Icon name="plus" className="apk-plus" />
          </button>
        ))}
      </div>

      {isTauri && (
        <div className="apk-path">
          <input type="text" value={path} placeholder="Ou le chemin d'un programme : C:\…\app.exe" onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPath()} />
          <button type="button" className="chip" onClick={addPath}>Ajouter</button>
        </div>
      )}
    </div>
  );
}
