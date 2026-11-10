import { useEffect, useState } from "react";
import { bridge, type MediaCommand } from "../../bridge";
import { defineWidget } from "../../sdk/types";
import { useMedia } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { Kicker, formatDuration } from "../../sdk/components";
import "./media.css";

interface Settings {
  showVolume: boolean;
}

/**
 * Nom lisible de l'appli qui joue, à partir de son identifiant Windows :
 * "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify", "Plex.exe" → "Plex".
 */
export function sourceName(id: string) {
  const s = id.toLowerCase();
  const known: [string, string][] = [
    ["plexamp", "Plexamp"], ["plex", "Plex"], ["spotify", "Spotify"], ["deezer", "Deezer"], ["tidal", "Tidal"], ["applemusic", "Apple Music"], ["itunes", "iTunes"],
    ["chrome", "Chrome"], ["msedge", "Edge"], ["firefox", "Firefox"], ["308046b0af4a39cb", "Firefox"], ["opera", "Opera"], ["brave", "Brave"], ["vlc", "VLC"], ["mpc-hc", "MPC-HC"], ["potplayer", "PotPlayer"],
    ["zunevideo", "Films et TV"], ["zunemusic", "Lecteur multimédia"], ["media.player", "Lecteur multimédia"], ["youtube", "YouTube"], ["netflix", "Netflix"], ["discord", "Discord"],
  ];
  const hit = known.find(([k]) => s.includes(k));
  if (hit) return hit[1];
  // Sinon : dernier segment, sans chemin ni extension .exe.
  const last = id.split(/[!\\/]/).pop() ?? "";
  const base = last.replace(/\.exe$/i, "").split(".").pop() ?? "";
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
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
    // Pochette illisible : on revient à l'illustration par défaut.
    const [badThumb, setBadThumb] = useState<string | null>(null);
    useEffect(() => setBadThumb(null), [m?.title]);
    const source = m?.source ? sourceName(m.source) : "";
    return (
      <div className="media">
        {m?.thumbnail && badThumb !== m.thumbnail ? (
          <img className="media-art" src={m.thumbnail} alt="" onError={() => setBadThumb(m.thumbnail)} />
        ) : (
          <div className="media-art media-art-empty"><Icon name="music" /></div>
        )}
        <div className="media-main">
          <Kicker>{m ? `En lecture${source ? ` · ${source}` : ""}` : "Lecture"}</Kicker>
          <div className="media-title">{m?.title || "Rien en lecture"}</div>
          {(m ? m.artist || m.album : "Lance une musique ou une vidéo") && (
            <div className="media-artist">{m ? m.artist || m.album : "Lance une musique ou une vidéo"}</div>
          )}
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
