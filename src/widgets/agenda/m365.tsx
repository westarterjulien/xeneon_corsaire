import { useEffect, useState, type ReactNode } from "react";
import { bridge, isTauri, type CalendarStatus } from "../../bridge";
import { Kicker } from "../../sdk/components";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps, SettingField } from "../../sdk/types";

/** Connexion Microsoft 365 partagée par l'Agenda et le statut Teams (même application Entra, même jeton). */
export interface M365Settings {
  clientId: string;
  tenant: string;
}

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const configured = (s: M365Settings) => !isTauri || (GUID.test(s.clientId?.trim() ?? "") && !!s.tenant?.trim());

/** Réglage « Compte » : état de la connexion et déconnexion. */
export function AccountField({ settings }: SettingEditorProps) {
  const s = settings as unknown as M365Settings;
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

export function Connect({ s, title = "Agenda Microsoft 365", help = "Connecte ton compte pour afficher tes réunions." }: { s: M365Settings; title?: string; help?: string }) {
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
      <Kicker>{title}</Kicker>
      <div className="ag-help">{help}</div>
      <button className="ag-btn primary" onClick={connect} disabled={busy}><Icon name="lock" /> {busy ? "Connexion…" : "Se connecter"}</button>
      {(error || status?.error) && <div className="ag-error">{error || status?.error}</div>}
    </div>
  );
}


/** Affiche `children` une fois connecté, sinon l'écran de connexion. */
export function M365Gate({ s, title, help, children }: { s: M365Settings; title?: string; help?: string; children: ReactNode }) {
  const cid = s.clientId.trim();
  const tenant = s.tenant.trim();
  const { value: status } = useShared<CalendarStatus>(`cal-status:${cid}:${tenant}`, () => bridge.calendarStatus(cid, tenant), 3000);
  if (!status) return null;
  return status.connected ? <>{children}</> : <Connect s={s} title={title} help={help} />;
}

/** Réglages communs (ID d'application, annuaire, compte). */
export const m365Fields: SettingField[] = [
  { key: "clientId", label: "ID d'application (Entra)", type: "text", default: "", placeholder: "00000000-0000-0000-0000-000000000000", help: "Voir le guide docs/agenda-microsoft365.md (5 minutes, une seule fois)." },
  { key: "tenant", label: "Annuaire", type: "text", default: "organizations", placeholder: "westarter.fr", help: "Ton domaine Microsoft 365 (ex. westarter.fr), ou « organizations »." },
  { key: "account", label: "Compte", type: "custom", editor: AccountField },
];

export function NotConfigured({ title }: { title: string }) {
  return (
    <div className="ag-connect">
      <Kicker>{title}</Kicker>
      <div className="ag-help">Ajoute l'ID d'application dans les réglages du widget (⚙). Le guide explique comment l'obtenir en 5 minutes.</div>
    </div>
  );
}
