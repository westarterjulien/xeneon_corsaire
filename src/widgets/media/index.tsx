import { useState } from "react";
import { bridge, type MediaCommand } from "../../bridge";
import { defineWidget } from "../../sdk/types";
import { useMedia } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { Kicker, formatDuration } from "../../sdk/components";
import "./media.css";

interface Settings {
  showVolume: boolean;
}

/** "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify" */
function sourceName(id: string) {
  const s = id.toLowerCase();
  const known: [string, string][] = [["spotify", "Spotify"], ["chrome", "Chrome"], ["msedge", "Edge"], ["firefox", "Firefox"], ["vlc", "VLC"], ["zune", "Lecteur multimédia"], ["music", "Musique"], ["deezer", "Deezer"], ["apple", "Apple Music"], ["youtube", "YouTube"]];
  return known.find(([k]) => s.includes(k))?.[1] ?? (id.split(/[!.\\/]/).pop() || "");
}

export default defineWidget<Settings>({
  type: "media",
  name: "Lecture en cours",
  description: "Spotify, navigateur, VLC… pochette et contrôles.",
  icon: "music",
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 4, h: 1 },
  settings: [{ key: "showVolume", label: "Boutons de volume", type: "boolean", default: true }],
  component: ({ settings }) => {
    const { value: m } = useMedia();
    const [busy, setBusy] = useState(false);
    const send = async (cmd: MediaCommand) => {
      setBusy(true);
      try {
        await bridge.mediaControl(cmd);
      } finally {
        setBusy(false);
      }
    };
    const progress = m && m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0;
    const source = m?.source ? sourceName(m.source) : "";
    return (
      <div className="media">
        {m?.thumbnail ? (
          <img className="media-art" src={m.thumbnail} alt="" />
        ) : (
          <div className="media-art media-art-empty"><Icon name="music" /></div>
        )}
        <div className="media-main">
          <Kicker>{m ? `En lecture${source ? ` · ${source}` : ""}` : "Lecture"}</Kicker>
          <div className="media-title">{m?.title || "Rien en lecture"}</div>
          <div className="media-artist">{m ? m.artist || m.album : "Lance une musique ou une vidéo"}</div>
          {m && m.duration > 0 && (
            <div className="media-progress">
              <div className="media-bar"><i style={{ width: `${progress}%` }} /></div>
              <div className="media-times"><span>{formatDuration(m.position)}</span><span>{formatDuration(m.duration)}</span></div>
            </div>
          )}
          <div className="media-ctrl">
            <button onClick={() => send("previous")} disabled={busy} aria-label="Précédent"><Icon name="prev" /></button>
            <button className="media-play" onClick={() => send("play_pause")} disabled={busy} aria-label="Lecture / pause"><Icon name={m?.playing ? "pause" : "play"} /></button>
            <button onClick={() => send("next")} disabled={busy} aria-label="Suivant"><Icon name="next" /></button>
            {settings.showVolume && (
              <div className="media-vol">
                <button onClick={() => send("volume_down")} aria-label="Baisser le volume"><Icon name="volume-down" /></button>
                <button onClick={() => send("mute")} aria-label="Couper le son"><Icon name="mute" /></button>
                <button onClick={() => send("volume_up")} aria-label="Monter le volume"><Icon name="volume" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
});
