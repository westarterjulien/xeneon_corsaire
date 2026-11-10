import { defineWidget } from "../../sdk/types";
import { useNow } from "../../sdk/hooks";
import { Kicker } from "../../sdk/components";
import "./clock.css";

interface Settings {
  hour24: boolean;
  showSeconds: boolean;
  showDate: boolean;
  timeZone: string;
  label: string;
}

export default defineWidget<Settings>({
  type: "clock",
  name: "Horloge",
  description: "Heure et date, fuseau au choix.",
  icon: "clock",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: "label", label: "Libellé", type: "text", default: "Paris", help: "Petit titre au-dessus de l'heure (vide = aucun)." },
    { key: "hour24", label: "Format 24 h", type: "boolean", default: true },
    { key: "showSeconds", label: "Afficher les secondes", type: "boolean", default: false },
    { key: "showDate", label: "Afficher la date", type: "boolean", default: true },
    { key: "timeZone", label: "Fuseau horaire", type: "text", default: "", placeholder: "Europe/Paris, America/New_York…", help: "Vide = heure locale." },
  ],
  component: ({ settings }) => {
    const now = useNow(settings.showSeconds ? 1000 : 5000);
    const tz = settings.timeZone?.trim() || undefined;
    let time = "";
    let date = "";
    try {
      time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: settings.showSeconds ? "2-digit" : undefined, hour12: !settings.hour24, timeZone: tz }).format(now);
      date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);
    } catch {
      time = "--:--";
      date = `Fuseau inconnu : ${tz}`;
    }
    return (
      <div className={`clock ${settings.showSeconds ? "has-seconds" : ""}`}>
        {settings.label && <Kicker>{settings.label}</Kicker>}
        <div className="clock-time">{time}</div>
        {settings.showDate && <div className="clock-date">{date}</div>}
      </div>
    );
  },
});
