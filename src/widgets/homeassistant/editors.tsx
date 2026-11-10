import { useEffect, useMemo, useState } from "react";
import { bridge, type HaEntity } from "../../bridge";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps } from "../../sdk/types";
import { entityIcon } from "./shared";

/** Jeton d'accès : vérifié puis chiffré par l'appli (il n'apparaît jamais dans la configuration). */
export function HaConnection({ settings }: SettingEditorProps) {
  const url = String(settings.url ?? "").trim();
  const [token, setToken] = useState("");
  const [has, setHas] = useState<boolean | null>(null);
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  useEffect(() => {
    if (url) bridge.haHasToken(url).then(setHas).catch(() => setHas(false));
  }, [url]);
  const save = async () => {
    setState({ busy: true, msg: null, ok: false });
    try {
      await bridge.haSave(url, token);
      setToken("");
      setHas(true);
      setState({ busy: false, msg: "Connecté : jeton vérifié et enregistré (chiffré).", ok: true });
    } catch (e) {
      setState({ busy: false, msg: String(e), ok: false });
    }
  };
  if (!url) return <span className="form-help">Renseigne d'abord l'adresse de Home Assistant.</span>;
  return (
    <div className="ha-conn">
      {has && <span className="form-help">✓ Jeton enregistré pour {url}. Tu peux le remplacer ci-dessous.</span>}
      <div className="ha-conn-row">
        <input type="password" value={token} placeholder="Jeton d'accès longue durée" onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        <button type="button" className="chip" onClick={save} disabled={!token.trim() || state.busy}>{state.busy ? "Vérification…" : "Enregistrer"}</button>
      </div>
      {state.msg && <span className={state.ok ? "form-help" : "field-error"}>{state.msg}</span>}
      <span className="form-help">Home Assistant → ton profil (en bas à gauche) → Sécurité → Jetons d'accès longue durée → Créer un jeton.</span>
    </div>
  );
}

/** Choix des entités à afficher. */
export function HaEntities({ value, onChange, settings }: SettingEditorProps) {
  const url = String(settings.url ?? "").trim();
  const chosen = (Array.isArray(value) ? value : []) as string[];
  const { value: all, error } = useShared<HaEntity[]>(`ha:${url}`, () => (url ? bridge.haStates(url) : Promise.resolve([])), 10_000);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map((all ?? []).map((e) => [e.entityId, e])), [all]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const useful = new Set(["light", "switch", "fan", "input_boolean", "scene", "script", "button", "sensor", "binary_sensor", "climate", "cover", "lock", "media_player"]);
    return (all ?? [])
      .filter((e) => useful.has(e.domain) && !chosen.includes(e.entityId))
      .filter((e) => !t || e.name.toLowerCase().includes(t) || e.entityId.includes(t))
      .slice(0, 30);
  }, [all, q, chosen]);
  if (!url) return <span className="form-help">Renseigne d'abord l'adresse et le jeton.</span>;
  return (
    <div className="apk">
      {chosen.length > 0 && (
        <div className="apk-chosen">
          {chosen.map((id, i) => {
            const e = byId.get(id);
            return (
              <div key={id} className="apk-item">
                <Icon name={e ? entityIcon(e) : "home"} />
                <span className="apk-name ha-name">{e?.name ?? id}</span>
                <button type="button" className="apk-btn" onClick={() => i > 0 && onChange(chosen.map((x, j) => (j === i - 1 ? id : j === i ? chosen[i - 1] : x)))} disabled={i === 0} aria-label="Monter"><Icon name="chevronLeft" style={{ transform: "rotate(90deg)" }} /></button>
                <button type="button" className="apk-btn danger" onClick={() => onChange(chosen.filter((x) => x !== id))} aria-label="Retirer"><Icon name="close" /></button>
              </div>
            );
          })}
        </div>
      )}
      <input type="text" value={q} placeholder="Chercher une lumière, une prise, un capteur…" onChange={(e) => setQ(e.target.value)} />
      {error && <span className="field-error">{String(error)}</span>}
      <div className="apk-results">
        {results.map((e) => (
          <button key={e.entityId} type="button" className="apk-result" onClick={() => onChange([...chosen, e.entityId])}>
            <Icon name={entityIcon(e)} />
            <span>{e.name}</span>
            <Icon name="plus" className="apk-plus" />
          </button>
        ))}
      </div>
    </div>
  );
}
