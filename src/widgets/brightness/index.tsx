import type { ScreenBrightness } from "../../bridge";
import { setScreenBrightness, useBrightness, useSoftDim } from "../../sdk/brightness";
import { Kicker, Slider } from "../../sdk/components";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import { MAX_SOFT_DIM } from "../../core/layout";
import "./brightness.css";

interface Settings {
  showOthers: boolean;
}

/** Préréglages proposés par un toucher sur l'icône. */
const PRESETS = [100, 60, 30, 10];
const nextPreset = (v: number) => PRESETS.find((p) => p < v - 2) ?? PRESETS[0];

function Row({ label, sub, value, onChange, small, min = 0 }: { label: string; sub?: string; value: number; onChange: (v: number) => void; small?: boolean; min?: number }) {
  return (
    <div className={`bri-row ${small ? "is-small" : ""}`}>
      <button className="bri-icon" onClick={() => onChange(Math.max(min, nextPreset(value)))} aria-label={`Luminosité ${label} : préréglage suivant`}>
        <Icon name={value < 40 ? "moon" : "sun"} />
      </button>
      <div className="bri-main">
        <div className="bri-label">
          <span>{label}</span>
          {sub && <span className="bri-sub">{sub}</span>}
        </div>
        <Slider value={value} onChange={(v) => onChange(Math.max(min, v))} ariaLabel={`Luminosité ${label}`} />
      </div>
      <div className="bri-value">{Math.round(value)}</div>
    </div>
  );
}

const screenName = (s: ScreenBrightness, i: number) => s.label || (s.isEdge ? "Xeneon Edge" : `Écran ${i + 1}`);

export default defineWidget<Settings>({
  type: "brightness",
  name: "Luminosité",
  description: "Vraie luminosité de l'Edge et des autres écrans (DDC/CI), ou voile logiciel si l'écran ne répond pas.",
  icon: "sun",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 3, h: 1 },
  settings: [{ key: "showOthers", label: "Afficher les autres écrans", type: "boolean", default: true, help: "Seuls les écrans qui acceptent le réglage (DDC/CI) apparaissent." }],
  component: ({ settings, size }) => {
    const { screens, error } = useBrightness();
    const soft = useSoftDim();
    if (!screens) return <div className="bri bri-empty">{error ? "Luminosité indisponible" : ""}</div>;

    const edge = screens.find((s) => s.isEdge);
    const others = settings.showOthers ? screens.filter((s) => !s.isEdge && s.supported) : [];
    const maxOthers = Math.max(0, Math.floor((size.h * 163 - (size.h > 1 ? 150 : 90)) / 70));

    return (
      <div className="bri">
        {size.h > 1 && <Kicker>Luminosité</Kicker>}
        {edge?.supported ? (
          <Row label="Edge" value={edge.value ?? 0} onChange={(v) => void setScreenBrightness(edge.name, v)} />
        ) : (
          // L'Edge ne répond pas au DDC/CI (ou n'est pas détecté) : voile logiciel, jamais totalement noir.
          <Row label="Edge" sub="voile logiciel" value={100 - soft.value} min={100 - MAX_SOFT_DIM} onChange={(v) => soft.set(100 - v)} />
        )}
        {others.slice(0, maxOthers).map((s, i) => (
          <Row key={s.name} small label={screenName(s, i + 1)} sub={`${s.width}×${s.height}`} value={s.value ?? 0} onChange={(v) => void setScreenBrightness(s.name, v)} />
        ))}
      </div>
    );
  },
});
