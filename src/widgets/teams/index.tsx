import { useState } from "react";
import { bridge, type Presence } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { defineWidget } from "../../sdk/types";
import { configured, M365Gate, m365Fields, NotConfigured, type M365Settings } from "../agenda/m365";
import "../agenda/agenda.css";
import "./teams.css";

interface Settings extends M365Settings {
  hours: string;
}

const STATUSES: { value: string; label: string; color: string }[] = [
  { value: "Available", label: "Disponible", color: "#7ee0a1" },
  { value: "Busy", label: "Occupé", color: "#ff6b6b" },
  { value: "DoNotDisturb", label: "Ne pas déranger", color: "#ff3b3b" },
  { value: "BeRightBack", label: "De retour bientôt", color: "#f5c451" },
  { value: "Away", label: "Absent", color: "#f5c451" },
  { value: "Offline", label: "Hors ligne", color: "#8b95a5" },
];

const describe = (a: string) =>
  STATUSES.find((s) => s.value === a) ??
  ({ AvailableIdle: STATUSES[0], BusyIdle: STATUSES[1], PresenceUnknown: { value: a, label: "Inconnu", color: "#8b95a5" } } as Record<string, (typeof STATUSES)[0]>)[a] ??
  { value: a, label: a || "—", color: "#8b95a5" };

function Status({ s, compact }: { s: Settings; compact: boolean }) {
  const cid = s.clientId.trim();
  const tenant = s.tenant.trim();
  const key = `teams:${cid}:${tenant}`;
  const { value, error } = useShared<Presence>(key, () => bridge.teamsPresence(cid, tenant), 30_000);
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = describe(local ?? value?.availability ?? "");

  const choose = async (availability: string) => {
    setBusy(true);
    setLocal(availability || null);
    try {
      await bridge.teamsSetPresence(cid, tenant, availability, Number(s.hours) || 8);
    } catch (e) {
      setLocal(null);
      console.error("[teams]", e);
    } finally {
      setBusy(false);
      window.setTimeout(() => setLocal(null), 15_000);
    }
  };

  return (
    <div className={`tms ${compact ? "is-compact" : ""}`}>
      <Kicker>Statut Teams</Kicker>
      <div className="tms-now">
        <span className="tms-dot" style={{ background: current.color, boxShadow: `0 0 14px ${current.color}` }} />
        <span className="tms-label">{current.label}</span>
      </div>
      {error && !value && <div className="ag-error">{String(error)}</div>}
      <div className="tms-choices">
        {STATUSES.map((st) => (
          <button key={st.value} className={`tms-btn ${current.value === st.value ? "is-active" : ""}`} onClick={() => choose(st.value)} disabled={busy}>
            <span className="tms-mini" style={{ background: st.color }} />
            {st.label}
          </button>
        ))}
        <button className="tms-btn tms-auto" onClick={() => choose("")} disabled={busy}>Automatique</button>
      </div>
    </div>
  );
}

export default defineWidget<Settings>({
  type: "teams",
  name: "Statut Teams",
  description: "Voir et changer ta disponibilité Teams (Microsoft 365).",
  icon: "user",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 3, h: 2 },
  settings: [
    ...m365Fields,
    { key: "hours", label: "Durée du statut choisi", type: "select", default: "8", options: [{ value: "1", label: "1 heure" }, { value: "4", label: "4 heures" }, { value: "8", label: "8 heures" }, { value: "24", label: "24 heures" }], help: "Ensuite Teams revient au statut automatique." },
  ],
  component: ({ settings, size }) => {
    if (!configured(settings)) return <NotConfigured title="Statut Teams" />;
    return (
      <M365Gate s={settings} title="Statut Teams" help="Connecte ton compte Microsoft 365 pour gérer ta disponibilité.">
        <Status s={settings} compact={size.h < 3} />
      </M365Gate>
    );
  },
});
