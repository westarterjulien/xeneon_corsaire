import { useState } from "react";
import { bridge, type AudioState, type DiscordStatus } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useNow, useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps } from "../../sdk/types";
import { defineWidget } from "../../sdk/types";
import "./discord.css";

interface Settings {
  mode: "rpc" | "keys";
  showMessages: boolean;
  deafenKeys: string;
  muteKeys: string;
}

const GUIDE = "https://github.com/westarterjulien/xeneon_corsaire/blob/main/docs/discord.md";

/** Réglage « Connexion » : identifiants de l'application Discord perso, état et autorisation. */
function DiscordConnection(_: SettingEditorProps) {
  const { value: st } = useShared<DiscordStatus>("discord", bridge.discordStatus, 1000);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try {
      await bridge.discordSetup(id, secret);
      setSecret("");
    } catch (e) {
      setErr(String(e));
    }
  };
  const state = !st?.configured
    ? "Non configuré"
    : !st.running
      ? "Discord n'est pas lancé"
      : st.waiting
        ? "Accepte la fenêtre d'autorisation dans Discord…"
        : st.authorized
          ? `Connecté${st.user ? ` (${st.user})` : ""} ✓`
          : "En attente d'autorisation";
  return (
    <div className="dsc-conn">
      <span className="form-help"><b>État :</b> {state}</span>
      {st?.error && <span className="field-error">{st.error}</span>}
      {st?.configured && st.running && !st.authorized && !st.waiting && (
        <button type="button" className="chip" onClick={() => bridge.discordAuthorize()}>Autoriser dans Discord</button>
      )}
      <input type="text" value={id} placeholder="Application ID" onChange={(e) => setId(e.target.value)} />
      <input type="password" value={secret} placeholder="Client Secret" onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
      <div className="dsc-conn-row">
        <button type="button" className="chip" onClick={save} disabled={!id.trim() || !secret.trim()}>{st?.configured ? "Remplacer et connecter" : "Connecter"}</button>
        {st?.configured && <button type="button" className="chip" onClick={() => bridge.discordForget()}>Oublier</button>}
        <button type="button" className="chip" onClick={() => bridge.runAction({ kind: "open", target: GUIDE })}>Guide (2 min)</button>
      </div>
      {err && <span className="field-error">{err}</span>}
      <span className="form-help">Crée ta propre application sur discord.com/developers : identifiants chiffrés par Windows, jamais partagés.</span>
    </div>
  );
}

function Buttons({ mic, deaf, onMic, onDeaf, micLabel, unread = 0 }: { mic: boolean; deaf: boolean; onMic: () => void; onDeaf: () => void; micLabel?: string; unread?: number }) {
  const [flash, setFlash] = useState<string | null>(null);
  const tap = (k: string, fn: () => void) => () => {
    setFlash(k);
    window.setTimeout(() => setFlash(null), 350);
    fn();
  };
  return (
    <div className="dsc-btns">
      <button className={`dsc-btn ${mic ? "is-off" : ""} ${flash === "mic" ? "is-flash" : ""}`} onClick={tap("mic", onMic)}>
        <span className="dsc-circle"><Icon name={mic ? "mic-off" : "mic"} /></span>
        <span className="dsc-label">{micLabel ?? (mic ? "Micro coupé" : "Micro")}</span>
      </button>
      <button className={`dsc-btn ${deaf ? "is-off" : ""} ${flash === "deaf" ? "is-flash" : ""}`} onClick={tap("deaf", onDeaf)}>
        <span className="dsc-circle"><Icon name={deaf ? "mute" : "headset"} /></span>
        <span className="dsc-label">{deaf ? "Sourdine" : "Casque"}</span>
      </button>
      <button className={`dsc-btn ${flash === "open" ? "is-flash" : ""}`} onClick={tap("open", () => void bridge.runAction({ kind: "open", target: "discord://" }))}>
        <span className="dsc-circle">
          <Icon name="chat" />
          {unread > 0 && <span className="dsc-badge">{unread}</span>}
        </span>
        <span className="dsc-label">{unread > 0 ? `${unread} nouveau${unread > 1 ? "x" : ""}` : "Ouvrir"}</span>
      </button>
    </div>
  );
}

function ago(at: number, now: number) {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return "maintenant";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} j`;
}

/** Derniers messages reçus (notifications Discord) : un toucher ouvre la conversation. */
function Messages({ st, max }: { st: DiscordStatus; max: number }) {
  const now = useNow(30_000).getTime();
  if (st.needsUpgrade) {
    return (
      <div className="dsc-msgs">
        <button className="dsc-upgrade" onClick={() => bridge.discordAuthorize()}>
          {st.waiting ? "Accepte la fenêtre dans Discord…" : "Autoriser l'affichage des messages"}
        </button>
      </div>
    );
  }
  const list = st.messages.slice(0, max);
  if (!list.length) return <div className="dsc-msgs dsc-none">Aucun nouveau message</div>;
  const open = (channelId: string) => {
    void bridge.discordOpen(channelId);
    void bridge.runAction({ kind: "open", target: "discord://" });
  };
  return (
    <div className="dsc-msgs">
      {list.map((m) => (
        <button key={m.id} className={`dsc-m ${m.unread ? "is-unread" : ""}`} onClick={() => open(m.channelId)}>
          {m.icon ? <img className="dsc-av" src={m.icon} alt="" draggable={false} /> : <span className="dsc-av dsc-av-letter">{m.title.replace(/^#/, "").charAt(0).toUpperCase()}</span>}
          <span className="dsc-m-text">
            <span className="dsc-m-title">{m.title}</span>
            <span className="dsc-m-body">{m.body}</span>
          </span>
          <span className="dsc-m-time">{ago(m.at, now)}</span>
          {m.unread && <span className="dsc-unread" />}
        </button>
      ))}
    </div>
  );
}

/** Mode direct : état réel de Discord, synchronisé dans les deux sens. */
function Direct({ showMessages, rows, cols }: { showMessages: boolean; rows: number; cols: number }) {
  const { value: st } = useShared<DiscordStatus>("discord", bridge.discordStatus, 700);
  const [local, setLocal] = useState<{ mute?: boolean; deaf?: boolean; at: number } | null>(null);
  if (!st) return null;
  if (!st.configured) return <div className="dsc-msg">Connecte Discord dans les réglages du widget (⚙) : 2 minutes, une seule fois.</div>;
  if (!st.running) return <div className="dsc-msg">Discord n'est pas lancé.</div>;
  if (!st.authorized) {
    return (
      <div className="dsc-msg">
        {st.waiting ? "Accepte la fenêtre d'autorisation dans Discord…" : <button className="dsc-auth" onClick={() => bridge.discordAuthorize()}>Autoriser Edge Studio dans Discord</button>}
        {st.error && <div className="dsc-err">{st.error}</div>}
      </div>
    );
  }
  // Affiche tout de suite le nouvel état, le temps que Discord le confirme.
  const fresh = local && Date.now() - local.at < 1500 ? local : null;
  const mute = fresh?.mute ?? st.mute;
  const deaf = fresh?.deaf ?? st.deaf;
  const unread = st.messages.filter((m) => m.unread).length;
  // Large mais peu haut : messages à côté des boutons. Haut : en dessous. Petit : simple badge.
  const side = showMessages && rows < 3 && cols >= 4;
  const below = showMessages && rows >= 3;
  const buttons = (
    <Buttons
      unread={showMessages && !side && !below ? unread : 0}
      mic={mute || deaf}
      deaf={deaf}
      onMic={() => {
        setLocal({ mute: !mute, at: Date.now() });
        void bridge.discordSet({ mute: !mute });
      }}
      onDeaf={() => {
        setLocal({ deaf: !deaf, at: Date.now() });
        void bridge.discordSet({ deaf: !deaf });
      }}
    />
  );
  if (!side && !below) return buttons;
  return (
    <div className={`dsc-split ${side ? "is-side" : ""}`}>
      {buttons}
      <Messages st={st} max={side ? (rows >= 2 ? 3 : 2) : rows >= 4 ? 3 : 2} />
    </div>
  );
}

/** Mode raccourcis : micro de Windows (état réel) et sourdine envoyée par raccourci clavier. */
function Keys({ s }: { s: Settings }) {
  const { value: audio } = useShared<AudioState>("audio", bridge.audioState, 1000);
  const [deaf, setDeaf] = useState(false);
  const winMic = !s.muteKeys?.trim();
  const mic = winMic ? !!audio?.input?.muted : false;
  return (
    <Buttons
      mic={mic}
      deaf={deaf}
      micLabel={winMic ? (mic ? "Micro coupé" : "Micro") : "Micro"}
      onMic={() => (winMic ? void bridge.audioSet("input", { muted: !mic }) : void bridge.runAction({ kind: "keys", keys: s.muteKeys }))}
      onDeaf={() => {
        setDeaf((d) => !d);
        void bridge.runAction({ kind: "keys", keys: s.deafenKeys || "ctrl+shift+d" });
      }}
    />
  );
}

export default defineWidget<Settings>({
  type: "discord",
  name: "Discord",
  description: "Micro et sourdine de Discord, synchronisés avec l'appli.",
  icon: "chat",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 1 },
  settings: [
    {
      key: "mode",
      label: "Fonctionnement",
      type: "select",
      default: "rpc",
      options: [
        { value: "rpc", label: "Connexion directe à Discord (état synchronisé)" },
        { value: "keys", label: "Raccourcis clavier (sans connexion)" },
      ],
    },
    { key: "connection", label: "Connexion à Discord", type: "custom", editor: DiscordConnection },
    { key: "showMessages", label: "Afficher les derniers messages reçus", type: "boolean", default: true, help: "Messages privés et mentions, selon tes notifications Discord. Affichés sous les boutons (3 cases de haut ou plus) ou à côté (4 cases de large ou plus) ; sinon, un badge compte les nouveaux." },
    { key: "muteKeys", label: "Mode raccourcis : touche « micro » de Discord", type: "text", default: "", placeholder: "vide = couper le micro de Windows" },
    { key: "deafenKeys", label: "Mode raccourcis : touche « sourdine » de Discord", type: "text", default: "ctrl+shift+d" },
  ],
  component: ({ settings, size }) => (
    <div className="dsc">
      <Kicker>Discord</Kicker>
      {settings.mode === "keys" ? <Keys s={settings} /> : <Direct showMessages={settings.showMessages !== false} rows={size.h} cols={size.w} />}
    </div>
  ),
});
