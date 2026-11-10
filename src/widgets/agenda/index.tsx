import { bridge, type CalendarEvent } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useNow, useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import { configured, M365Gate, m365Fields, NotConfigured } from "./m365";
import "./agenda.css";

interface Settings {
  clientId: string;
  tenant: string;
  days: string;
  teamsApp: boolean;
}

const hm = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function dayLabel(d: Date, now: Date) {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function relative(ev: CalendarEvent, now: Date) {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const min = (ms: number) => Math.max(1, Math.round(ms / 60000));
  const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`);
  if (start <= now) return { live: true, text: `En cours · fin dans ${fmt(min(end.getTime() - now.getTime()))}` };
  const m = min(start.getTime() - now.getTime());
  if (startOfDay(start).getTime() !== startOfDay(now).getTime()) return { live: false, text: `${dayLabel(start, now)} à ${hm(start)}` };
  return { live: false, text: m <= 5 ? `Dans ${m} min — c'est bientôt` : `Dans ${fmt(m)}` };
}

const teamsLink = (url: string, app: boolean) => (app ? url.replace(/^https:\/\/teams\.microsoft\.com/i, "msteams:") : url);

function Agenda({ s, wide }: { s: Settings; wide: boolean }) {
  const now = useNow(30_000);
  const cid = s.clientId.trim();
  const tenant = s.tenant.trim();
  const days = Math.max(1, Number(s.days) || 2);
  const key = `cal-events:${cid}:${tenant}:${days}`;
  const { value: events, error } = useShared<CalendarEvent[]>(
    key,
    () => {
      const start = startOfDay(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + days);
      return bridge.calendarEvents(cid, tenant, start.toISOString(), end.toISOString());
    },
    60_000,
  );

  if (!events) return <div className="ag-empty">{error ? <span className="ag-error">{error}</span> : ""}</div>;

  const live = events.filter((e) => !e.cancelled);
  const allDay = live.filter((e) => e.allDay && new Date(e.end) > now && new Date(e.start) <= new Date(now.getTime() + 86400000));
  const timed = live.filter((e) => !e.allDay && new Date(e.end) > now).sort((a, b) => a.start.localeCompare(b.start));
  const next = timed[0];
  const rest = timed.slice(1);
  const rel = next ? relative(next, now) : null;

  const groups: { label: string; items: CalendarEvent[] }[] = [];
  for (const e of rest) {
    const label = dayLabel(new Date(e.start), now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <div className={`ag ${wide ? "is-wide" : ""}`}>
      <div className="ag-next">
        <Kicker>{next ? (rel?.live ? "Maintenant" : "Prochain") : "Agenda"}</Kicker>
        {next ? (
          <>
            <div className={`ag-when ${rel?.live ? "is-live" : ""}`}>{rel?.text}</div>
            <div className="ag-title">{next.subject}</div>
            <div className="ag-meta">
              {hm(new Date(next.start))} – {hm(new Date(next.end))}
              {next.location ? ` · ${next.location}` : ""}
            </div>
            {next.joinUrl && (
              <button className="ag-btn primary" onClick={() => bridge.runAction({ kind: "open", target: teamsLink(next.joinUrl!, s.teamsApp) })}>
                <Icon name="camera" /> Rejoindre
              </button>
            )}
          </>
        ) : (
          <div className="ag-title ag-free">Rien de prévu</div>
        )}
      </div>
      <div className="ag-list">
        {allDay.map((e) => (
          <div key={e.id} className="ag-allday">{e.subject}</div>
        ))}
        {groups.map((g) => (
          <div key={g.label} className="ag-group">
            <div className="ag-day">{g.label}</div>
            {g.items.map((e) => (
              <div key={e.id} className="ag-row">
                <span className="ag-time">{hm(new Date(e.start))}</span>
                <span className="ag-subject">{e.subject}</span>
                {e.joinUrl && <Icon name="camera" className="ag-teams" />}
              </div>
            ))}
          </div>
        ))}
        {!rest.length && !allDay.length && next && <div className="ag-day">Rien d'autre {days > 1 ? "d'ici là" : "aujourd'hui"}</div>}
      </div>
    </div>
  );
}

export default defineWidget<Settings>({
  type: "agenda",
  name: "Agenda",
  description: "Réunions Microsoft 365 / Outlook, prochain rendez-vous, bouton Rejoindre Teams.",
  icon: "clock",
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 3, h: 2 },
  settings: [
    ...m365Fields,
    { key: "days", label: "Jours affichés", type: "select", default: "2", options: [{ value: "1", label: "Aujourd'hui" }, { value: "2", label: "Aujourd'hui et demain" }, { value: "7", label: "7 jours" }] },
    { key: "teamsApp", label: "Ouvrir les réunions dans l'appli Teams", type: "boolean", default: true },
  ],
  component: ({ settings, size }) => {
    if (!configured(settings)) return <NotConfigured title="Agenda Microsoft 365" />;
    return (
      <M365Gate s={settings}>
        <Agenda s={settings} wide={size.w >= 6} />
      </M365Gate>
    );
  },
});

