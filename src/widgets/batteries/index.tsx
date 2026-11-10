import { bridge, type Battery } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./batteries.css";

interface Settings {
  low: number;
  ghub: boolean;
  icue: boolean;
}

const ICONS: Record<Battery["kind"], string> = { mouse: "mouse", keyboard: "keyboard", headset: "headset", other: "battery" };

export default defineWidget<Settings>({
  type: "batteries",
  name: "Batteries",
  description: "Batterie des périphériques sans fil Logitech (G HUB) et Corsair (iCUE).",
  icon: "battery",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: "ghub", label: "Logitech (G HUB)", type: "boolean", default: true, help: "G HUB doit être lancé (il tourne en général en arrière-plan)." },
    { key: "icue", label: "Corsair (iCUE)", type: "boolean", default: true, help: "iCUE doit être lancé. Au premier usage, le kit officiel de Corsair est téléchargé depuis leur GitHub et vérifié." },
    { key: "low", label: "Alerte batterie faible (%)", type: "number", default: 20, min: 5, max: 50 },
  ],
  component: ({ settings, size }) => {
    const off = () => Promise.resolve([] as Battery[]);
    const g = useShared<Battery[]>(`ghub:${settings.ghub !== false}`, settings.ghub !== false ? bridge.ghubBatteries : off, 30_000);
    const c = useShared<Battery[]>(`icue:${settings.icue !== false}`, settings.icue !== false ? bridge.icueBatteries : off, 30_000);
    const value = g.value || c.value ? [...(g.value ?? []), ...(c.value ?? [])] : undefined;
    const errors = [g.error && settings.ghub !== false ? `Logitech : ${g.error}` : null, c.error && settings.icue !== false ? `Corsair : ${c.error}` : null].filter(Boolean);
    if (!value) {
      return (
        <div className="bat bat-empty">
          <Kicker>Batteries</Kicker>
          {errors.map((e) => <div key={e} className="bat-help">{e}</div>)}
        </div>
      );
    }
    if (!value.length) {
      return (
        <div className="bat bat-empty">
          <Kicker>Batteries</Kicker>
          <div className="bat-help">Aucun périphérique sans fil allumé.</div>
          {errors.map((e) => <div key={e} className="bat-note">{e}</div>)}
        </div>
      );
    }
    const low = settings.low || 20;
    return (
      <div className="bat">
        {size.h > 1 && <Kicker>Batteries</Kicker>}
        <div className="bat-list">
          {value.map((b) => {
            const p = Math.round(b.percentage ?? 0);
            return (
              <div key={b.id} className={`bat-row ${p <= low && !b.charging ? "is-low" : ""} ${b.charging ? "is-charging" : ""}`}>
                <Icon name={ICONS[b.kind] ?? "battery"} className="bat-icon" />
                <div className="bat-main">
                  <div className="bat-name">
                    {b.name}
                    {b.charging && <Icon name="zap" className="bat-bolt" />}
                  </div>
                  <div className="bat-track"><i style={{ width: `${p}%` }} /></div>
                </div>
                <div className="bat-pct">{p}<small>%</small></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
