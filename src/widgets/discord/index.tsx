import { useState } from "react";
import { bridge, type AudioState } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./discord.css";

interface Settings {
  deafenKeys: string;
  muteKeys: string;
}

export default defineWidget<Settings>({
  type: "discord",
  name: "Discord",
  description: "Couper le micro, mode sourdine, ouvrir Discord.",
  icon: "chat",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [
    {
      key: "muteKeys",
      label: "Raccourci « micro » de Discord",
      type: "text",
      default: "",
      placeholder: "vide = couper le micro de Windows",
      help: "Vide (conseillé) : le bouton coupe le micro de Windows, ce qui coupe aussi Discord, et son état est toujours juste. Sinon, mets ici le raccourci « Activer/désactiver le micro » de Discord.",
    },
    {
      key: "deafenKeys",
      label: "Raccourci « sourdine » de Discord",
      type: "text",
      default: "ctrl+shift+d",
      help: "À déclarer aussi dans Discord : Paramètres → Raccourcis clavier → « Activer/désactiver la sourdine ».",
    },
  ],
  component: ({ settings }) => {
    const { value: audio } = useShared<AudioState>("audio", bridge.audioState, 1000);
    const [deaf, setDeaf] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const blink = (k: string) => {
      setFlash(k);
      window.setTimeout(() => setFlash(null), 400);
    };
    const winMic = !settings.muteKeys?.trim();
    const micMuted = winMic ? !!audio?.input?.muted : false;

    const toggleMic = async () => {
      blink("mic");
      if (winMic) await bridge.audioSet("input", { muted: !micMuted }).catch(() => {});
      else await bridge.runAction({ kind: "keys", keys: settings.muteKeys }).catch(() => {});
    };
    const toggleDeaf = async () => {
      blink("deaf");
      setDeaf((d) => !d);
      await bridge.runAction({ kind: "keys", keys: settings.deafenKeys || "ctrl+shift+d" }).catch(() => {});
    };

    return (
      <div className="dsc">
        <Kicker>Discord</Kicker>
        <div className="dsc-btns">
          <button className={`dsc-btn ${micMuted ? "is-off" : ""} ${flash === "mic" ? "is-flash" : ""}`} onClick={toggleMic}>
            <span className="dsc-circle"><Icon name={micMuted ? "mic-off" : "mic"} /></span>
            <span className="dsc-label">{winMic ? (micMuted ? "Micro coupé" : "Micro") : "Micro"}</span>
          </button>
          <button className={`dsc-btn ${deaf ? "is-off" : ""} ${flash === "deaf" ? "is-flash" : ""}`} onClick={toggleDeaf}>
            <span className="dsc-circle"><Icon name={deaf ? "mute" : "headset"} /></span>
            <span className="dsc-label">Sourdine</span>
          </button>
          <button className={`dsc-btn ${flash === "open" ? "is-flash" : ""}`} onClick={() => { blink("open"); void bridge.runAction({ kind: "open", target: "discord://" }); }}>
            <span className="dsc-circle"><Icon name="chat" /></span>
            <span className="dsc-label">Ouvrir</span>
          </button>
        </div>
      </div>
    );
  },
});
