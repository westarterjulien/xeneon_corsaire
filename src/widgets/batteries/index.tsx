import { bridge, type Battery } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./batteries.css";

interface Settings {
  low: number;
}

const ICONS: Record<Battery["kind"], string> = { mouse: "mouse", keyboard: "keyboard", headset: "headset", other: "battery" };

export default defineWidget<Settings>({
  type: "batteries",
  name: "Batteries",
  description: "Niveau de batterie des périphériques Logitech (via G HUB).",
  icon: "battery",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [{ key: "low", label: "Alerte batterie faible (%)", type: "number", default: 20, min: 5, max: 50, help: "Nécessite Logitech G HUB lancé (il tourne en général déjà en arrière-plan)." }],
  component: ({ settings, size }) => {
    const { value, error } = useShared<Battery[]>("ghub", bridge.ghubBatteries, 30_000);
    if (!value) {
      return (
        <div className="bat bat-empty">
          <Kicker>Batteries</Kicker>
          {error && <div className="bat-help">{String(error).includes("lancé") ? "G HUB n'est pas lancé." : `G HUB indisponible : ${error}`}</div>}
        </div>
      );
    }
    if (!value.length) {
      return (
        <div className="bat bat-empty">
          <Kicker>Batteries</Kicker>
          <div className="bat-help">Aucun périphérique sans fil Logitech allumé.</div>
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
