import { useState, type CSSProperties } from "react";
import { bridge, type HaEntity } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import { HaConnection, HaEntities } from "./editors";
import { entityIcon, RUN, stateLabel, TOGGLE } from "./shared";
import "../apps/apps.css";
import "./homeassistant.css";

interface Settings {
  url: string;
  title: string;
  entities: string[];
  columns: number;
}

export default defineWidget<Settings>({
  type: "homeassistant",
  name: "Home Assistant",
  description: "Lumières, prises, scènes et capteurs de ta maison.",
  icon: "home",
  defaultSize: { w: 5, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: "url", label: "Adresse de Home Assistant", type: "text", default: "", placeholder: "http://homeassistant.local:8123" },
    { key: "token", label: "Connexion", type: "custom", editor: HaConnection },
    { key: "entities", label: "Éléments affichés", type: "custom", default: [], editor: HaEntities },
    { key: "title", label: "Titre", type: "text", default: "Maison" },
    { key: "columns", label: "Colonnes", type: "number", default: 4, min: 1, max: 10 },
  ],
  component: ({ settings }) => {
    const url = settings.url?.trim() ?? "";
    const ids = Array.isArray(settings.entities) ? settings.entities : [];
    const { value: all, error } = useShared<HaEntity[]>(`ha:${url}`, () => (url ? bridge.haStates(url) : Promise.resolve([])), 4000);
    const [pending, setPending] = useState<Record<string, string>>({});
    if (!url || !ids.length) {
      return (
        <div className="ha ha-empty">
          <Kicker>Home Assistant</Kicker>
          <div className="aps-help">{!url ? "Renseigne l'adresse et le jeton dans les réglages (⚙)." : "Choisis les éléments à afficher dans les réglages (⚙)."}</div>
        </div>
      );
    }
    const byId = new Map((all ?? []).map((e) => [e.entityId, e]));
    const items = ids.map((id) => byId.get(id)).filter((e): e is HaEntity => !!e);
    const cols = Math.max(1, Math.min(items.length || 1, settings.columns || 1));

    const tap = async (e: HaEntity) => {
      const service = TOGGLE.has(e.domain) ? "toggle" : RUN[e.domain];
      if (!service) return;
      if (TOGGLE.has(e.domain)) setPending((p) => ({ ...p, [e.entityId]: e.state === "on" ? "off" : "on" }));
      try {
        await bridge.haService(url, e.domain, service, e.entityId);
      } finally {
        window.setTimeout(() => setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== e.entityId))), 2500);
      }
    };

    return (
      <div className="ha" style={{ "--cols": cols } as CSSProperties}>
        {settings.title && <Kicker>{settings.title}</Kicker>}
        {error && !all && <div className="field-error">{String(error)}</div>}
        <div className="ha-grid">
          {items.map((e) => {
            const state = pending[e.entityId] ?? e.state;
            const shown = { ...e, state };
            const active = TOGGLE.has(e.domain) && state === "on";
            const actionable = TOGGLE.has(e.domain) || e.domain in RUN;
            return (
              <button key={e.entityId} className={`ha-tile ${active ? "is-on" : ""} ${actionable ? "" : "is-readonly"}`} onClick={() => actionable && tap(e)}>
                <span className="ha-icon"><Icon name={entityIcon(e)} /></span>
                <span className="ha-name">{e.name}</span>
                <span className="ha-state">{stateLabel(shown)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
});
