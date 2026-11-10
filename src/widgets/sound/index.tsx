import { useState } from "react";
import { bridge, type AudioState } from "../../bridge";
import { Kicker, Slider } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./sound.css";

interface Settings {
  showInput: boolean;
  showApps: boolean;
}

interface RowProps {
  target: string;
  icon: string;
  mutedIcon: string;
  label: string;
  sub?: string;
  volume: number;
  muted: boolean;
  small?: boolean;
  set: (target: string, change: { volume?: number; muted?: boolean }) => void;
}

function Row({ target, icon, mutedIcon, label, sub, volume, muted, small, set }: RowProps) {
  return (
    <div className={`snd-row ${small ? "is-small" : ""} ${muted ? "is-muted" : ""}`}>
      <button className="snd-mute" onClick={() => set(target, { muted: !muted })} aria-label={muted ? `Réactiver ${label}` : `Couper ${label}`}>
        <Icon name={muted ? mutedIcon : icon} />
      </button>
      <div className="snd-main">
        <div className="snd-label">
          <span>{label}</span>
          {sub && <span className="snd-sub">{sub}</span>}
        </div>
        <Slider value={volume} onChange={(v) => set(target, { volume: v, ...(muted && v > 0 ? { muted: false } : {}) })} ariaLabel={`Volume ${label}`} />
      </div>
      <div className="snd-value">{Math.round(volume)}</div>
    </div>
  );
}

export default defineWidget<Settings>({
  type: "sound",
  name: "Son",
  description: "Volume du son et du micro, sourdine, volume de chaque appli.",
  icon: "volume",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 1 },
  settings: [
    { key: "showInput", label: "Afficher le micro", type: "boolean", default: true },
    { key: "showApps", label: "Volume par appli", type: "boolean", default: true },
  ],
  component: ({ settings, size }) => {
    const { value, error } = useShared<AudioState>("audio", bridge.audioState, 1000);
    // Valeurs envoyées récemment : affichées tout de suite, sans attendre la prochaine lecture.
    const [local, setLocal] = useState<Record<string, { volume?: number; muted?: boolean; at: number }>>({});
    const set = (target: string, change: { volume?: number; muted?: boolean }) => {
      setLocal((l) => ({ ...l, [target]: { ...l[target], ...change, at: Date.now() } }));
      void bridge.audioSet(target, change).catch((e) => console.error("[son]", e));
    };
    const pick = <T extends { volume: number; muted: boolean }>(target: string, e: T): T => {
      const o = local[target];
      return o && Date.now() - o.at < 1500 ? { ...e, volume: o.volume ?? e.volume, muted: o.muted ?? e.muted } : e;
    };

    if (!value) return <div className="snd snd-empty">{error ? "Son indisponible" : ""}</div>;
    const out = value.output && pick("output", value.output);
    const inp = value.input && pick("input", value.input);
    const maxApps = Math.max(0, Math.floor((size.h * 163 - 260) / 62));
    const apps = settings.showApps ? value.apps.slice(0, maxApps) : [];

    return (
      <div className="snd">
        {size.h > 1 && <Kicker>Son</Kicker>}
        {out && <Row target="output" icon="volume" mutedIcon="mute" label="Sortie" sub={out.name} volume={out.volume} muted={out.muted} set={set} />}
        {settings.showInput && inp && size.h > 1 && <Row target="input" icon="mic" mutedIcon="mic-off" label="Micro" sub={inp.name} volume={inp.volume} muted={inp.muted} set={set} />}
        {apps.length > 0 && (
          <div className="snd-apps">
            <div className="snd-section">Applications</div>
            {apps.map((a) => {
              const t = `app:${a.pid}`;
              const v = pick(t, a);
              return <Row key={a.pid} target={t} icon="volume" mutedIcon="mute" label={a.name} volume={v.volume} muted={v.muted} small set={set} />;
            })}
          </div>
        )}
      </div>
    );
  },
});
