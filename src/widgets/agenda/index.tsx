import { useEffect, useState } from "react";
import { bridge, isTauri, type CalendarEvent, type CalendarStatus } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useNow, useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps } from "../../sdk/types";
import { defineWidget } from "../../sdk/types";
import "./agenda.css";

interface Settings {
  clientId: string;
  tenant: string;
  days: string;
  teamsApp: boolean;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const configured = (s: Settings) => !isTauri || (GUID.test(s.clientId?.trim() ?? "") && !!s.tenant?.trim());

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

/** Réglage « Compte » : état de la connexion et déconnexion. */
function AccountField({ settings }: SettingEditorProps) {
  const s = settings as unknown as Settings;
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  useEffect(() => {
    if (configured(s)) bridge.calendarStatus(s.clientId.trim(), s.tenant.trim()).then(setStatus).catch(() => setStatus(null));
  }, [s.clientId, s.tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!configured(s)) return <span className="form-help">Renseigne d'abord l'ID d'application et l'annuaire.</span>;
  if (!status?.connected) return <span className="form-help">Non connecté : utilise le bouton « Se connecter » sur le widget.</span>;
  return (
    <div className="row-inline">
      <span>{status.account || "Connecté"}</span>
      <button type="button" className="chip" onClick={() => bridge.calendarDisconnect().then(() => setStatus({ ...status, connected: false }))}>Se déconnecter</button>
    </div>
  );
}

function Connect({ s }: { s: Settings }) {
  const cid = s.clientId.trim();
  const tenant = s.tenant.trim();
  const { value: status } = useShared<CalendarStatus>(`cal-status:${cid}:${tenant}`, () => bridge.calendarStatus(cid, tenant), 3000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.calendarConnect(cid, tenant);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (status?.userCode) {
    return (
      <div className="ag-connect">
        <Kicker>Connexion Microsoft 365</Kicker>
        <div className="ag-code">{status.userCode}</div>
        <div className="ag-help">
          Saisis ce code sur <b>{(status.verificationUri ?? "microsoft.com/devicelogin").replace(/^https?:\/\//, "")}</b> — la page vient de s'ouvrir sur ton écran principal.
        </div>
      </div>
    );
  }
  return (
    <div className="ag-connect">
      <Kicker>Agenda Microsoft 365</Kicker>
      <div className="ag-help">Connecte ton compte pour afficher tes réunions.</div>
      <button className="ag-btn primary" onClick={connect} disabled={busy}><Icon name="lock" /> {busy ? "Connexion…" : "Se connecter"}</button>
      {(error || status?.error) && <div className="ag-error">{error || status?.error}</div>}
    </div>
  );
}

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
    { key: "clientId", label: "ID d'application (Entra)", type: "text", default: "", placeholder: "00000000-0000-0000-0000-000000000000", help: "Voir le guide docs/agenda-microsoft365.md (5 minutes, une seule fois)." },
    { key: "tenant", label: "Annuaire", type: "text", default: "organizations", placeholder: "westarter.fr", help: "Ton domaine Microsoft 365 (ex. westarter.fr), ou « organizations »." },
    { key: "account", label: "Compte", type: "custom", editor: AccountField },
    { key: "days", label: "Jours affichés", type: "select", default: "2", options: [{ value: "1", label: "Aujourd'hui" }, { value: "2", label: "Aujourd'hui et demain" }, { value: "7", label: "7 jours" }] },
    { key: "teamsApp", label: "Ouvrir les réunions dans l'appli Teams", type: "boolean", default: true },
  ],
  component: ({ settings, size }) => {
    if (!configured(settings)) {
      return (
        <div className="ag-connect">
          <Kicker>Agenda Microsoft 365</Kicker>
          <div className="ag-help">Ajoute l'ID d'application dans les réglages du widget (⚙). Le guide explique comment l'obtenir en 5 minutes.</div>
        </div>
      );
    }
    return <AgendaGate s={settings} wide={size.w >= 6} />;
  },
});

function AgendaGate({ s, wide }: { s: Settings; wide: boolean }) {
  const cid = s.clientId.trim();
  const tenant = s.tenant.trim();
  const { value: status } = useShared<CalendarStatus>(`cal-status:${cid}:${tenant}`, () => bridge.calendarStatus(cid, tenant), 3000);
  if (!status) return null;
  return status.connected ? <Agenda s={s} wide={wide} /> : <Connect s={s} />;
}
