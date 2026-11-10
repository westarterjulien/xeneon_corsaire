//! Agenda Microsoft 365 via Microsoft Graph.
//! Connexion par « code d'appareil » : l'Edge affiche un code, l'utilisateur le saisit sur microsoft.com/devicelogin.
//! Le jeton de rafraîchissement est chiffré avec DPAPI (lié à la session Windows) et ne quitte jamais le backend.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

// Presence.ReadWrite : statut Teams (lecture et changement).
const SCOPES: &str = "offline_access User.Read Calendars.Read Presence.ReadWrite";

struct Pending {
    user_code: String,
    verification_uri: String,
    expires: Instant,
}

#[derive(Default)]
struct State {
    access: Option<(String, Instant)>,
    pending: Option<Pending>,
    last_error: Option<String>,
}

static STATE: Mutex<State> = Mutex::new(State { access: None, pending: None, last_error: None });

#[derive(Serialize, Deserialize, Clone)]
struct Stored {
    client_id: String,
    tenant: String,
    refresh_token: String,
    account: String,
}

fn agent() -> Result<ureq::Agent, String> {
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    Ok(ureq::AgentBuilder::new().tls_connector(Arc::new(tls)).timeout(Duration::from_secs(20)).build())
}

/// Identifiants attendus : GUID pour l'application, domaine / GUID / "organizations" pour l'annuaire.
fn validate(client_id: &str, tenant: &str) -> Result<(), String> {
    let guid = client_id.len() == 36 && client_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !guid {
        return Err("ID d'application invalide (format attendu : 00000000-0000-0000-0000-000000000000)".into());
    }
    if tenant.is_empty() || !tenant.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("Annuaire invalide (ex. westarter.fr ou organizations)".into());
    }
    Ok(())
}

fn login_url(tenant: &str, path: &str) -> String {
    format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{path}")
}

/// POST de formulaire ; renvoie le JSON même en cas d'erreur HTTP (Microsoft y décrit l'erreur).
fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    match agent()?.post(url).send_form(form) {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, r)) => r.into_json().map_err(|e| e.to_string()),
        Err(e) => Err(format!("connexion à Microsoft impossible : {e}")),
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("m365.token"))
}

fn save(app: &AppHandle, s: &Stored) -> Result<(), String> {
    let p = store_path(app)?;
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let data = protect(&serde_json::to_vec(s).map_err(|e| e.to_string())?)?;
    fs::write(p, data).map_err(|e| e.to_string())
}

fn load(app: &AppHandle) -> Option<Stored> {
    let raw = fs::read(store_path(app).ok()?).ok()?;
    serde_json::from_slice(&unprotect(&raw).ok()?).ok()
}

use crate::secret::{protect, unprotect};

// ---------- Jetons ----------
fn graph_get(token: &str, url: &str) -> Result<Value, String> {
    match agent()?.get(url).set("Authorization", &format!("Bearer {token}")).set("Prefer", "outlook.timezone=\"UTC\"").call() {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, r)) => {
            let v: Value = r.into_json().unwrap_or_default();
            Err(format!("Microsoft Graph ({code}) : {}", v.pointer("/error/message").and_then(Value::as_str).unwrap_or("erreur")))
        }
        Err(e) => Err(format!("connexion à Microsoft impossible : {e}")),
    }
}

fn graph_post(token: &str, url: &str, body: Value) -> Result<(), String> {
    match agent()?.post(url).set("Authorization", &format!("Bearer {token}")).send_json(body) {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, r)) => {
            let v: Value = r.into_json().unwrap_or_default();
            Err(format!("Microsoft Graph ({code}) : {}", v.pointer("/error/message").and_then(Value::as_str).unwrap_or("erreur")))
        }
        Err(e) => Err(format!("connexion à Microsoft impossible : {e}")),
    }
}

/// Jeton d'accès valide (rafraîchi si besoin) pour l'application demandée.
fn access_token(app: &AppHandle, client_id: &str, tenant: &str) -> Result<String, String> {
    if let Ok(s) = STATE.lock() {
        if let Some((t, exp)) = &s.access {
            if *exp > Instant::now() + Duration::from_secs(60) {
                return Ok(t.clone());
            }
        }
    }
    let mut stored = load(app).ok_or("non connecté")?;
    if stored.client_id != client_id || stored.tenant != tenant {
        return Err("non connecté".into());
    }
    let v = post_form(
        &login_url(tenant, "token"),
        &[("client_id", client_id), ("grant_type", "refresh_token"), ("refresh_token", &stored.refresh_token), ("scope", SCOPES)],
    )?;
    let Some(token) = v.get("access_token").and_then(Value::as_str) else {
        // Jeton révoqué ou expiré : il faut se reconnecter.
        let _ = fs::remove_file(store_path(app)?);
        return Err(format!("session expirée, reconnecte-toi ({})", v.get("error").and_then(Value::as_str).unwrap_or("erreur")));
    };
    let expires = v.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
    if let Some(r) = v.get("refresh_token").and_then(Value::as_str) {
        stored.refresh_token = r.to_string();
        save(app, &stored)?;
    }
    if let Ok(mut s) = STATE.lock() {
        s.access = Some((token.to_string(), Instant::now() + Duration::from_secs(expires)));
    }
    Ok(token.to_string())
}

/// Attend la saisie du code par l'utilisateur, puis enregistre les jetons.
fn poll(app: AppHandle, client_id: String, tenant: String, device_code: String, interval: u64, expires: Instant) {
    let mut wait = interval.max(2);
    while Instant::now() < expires {
        std::thread::sleep(Duration::from_secs(wait));
        let v = match post_form(
            &login_url(&tenant, "token"),
            &[("client_id", &client_id), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"), ("device_code", &device_code)],
        ) {
            Ok(v) => v,
            Err(_) => continue, // coupure réseau passagère : on réessaie
        };
        match v.get("error").and_then(Value::as_str) {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                wait += 5;
                continue;
            }
            Some(err) => {
                let msg = v.get("error_description").and_then(Value::as_str).unwrap_or(err);
                finish(&app, Some(format!("connexion refusée : {}", msg.lines().next().unwrap_or(msg))));
                return;
            }
            None => {}
        }
        let (Some(access), Some(refresh)) = (v.get("access_token").and_then(Value::as_str), v.get("refresh_token").and_then(Value::as_str)) else {
            finish(&app, Some("réponse inattendue de Microsoft".into()));
            return;
        };
        let account = graph_get(access, "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName")
            .ok()
            .and_then(|me| {
                me.get("mail").and_then(Value::as_str).or_else(|| me.get("userPrincipalName").and_then(Value::as_str)).map(str::to_owned)
            })
            .unwrap_or_default();
        let stored = Stored { client_id: client_id.clone(), tenant: tenant.clone(), refresh_token: refresh.to_string(), account };
        let saved = save(&app, &stored);
        if let Ok(mut s) = STATE.lock() {
            let expires_in = v.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
            s.access = Some((access.to_string(), Instant::now() + Duration::from_secs(expires_in)));
        }
        finish(&app, saved.err());
        return;
    }
    finish(&app, Some("code expiré, recommence la connexion".into()));
}

fn finish(app: &AppHandle, error: Option<String>) {
    if let Ok(mut s) = STATE.lock() {
        s.pending = None;
        s.last_error = error;
    }
    let _ = app.emit("calendar-changed", ());
}

// ---------- Commandes ----------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarStatus {
    connected: bool,
    account: Option<String>,
    user_code: Option<String>,
    verification_uri: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn calendar_status(app: AppHandle, client_id: String, tenant: String) -> CalendarStatus {
    let stored = load(&app).filter(|s| s.client_id == client_id && s.tenant == tenant);
    let s = STATE.lock().ok();
    let pending = s.as_ref().and_then(|s| s.pending.as_ref()).filter(|p| p.expires > Instant::now());
    CalendarStatus {
        connected: stored.is_some(),
        account: stored.map(|s| s.account),
        user_code: pending.map(|p| p.user_code.clone()),
        verification_uri: pending.map(|p| p.verification_uri.clone()),
        error: s.as_ref().and_then(|s| s.last_error.clone()),
    }
}

/// Démarre la connexion : renvoie le code à saisir et ouvre la page Microsoft sur l'écran principal.
#[tauri::command]
pub async fn calendar_connect(app: AppHandle, client_id: String, tenant: String) -> Result<CalendarStatus, String> {
    validate(&client_id, &tenant)?;
    let (cid, ten) = (client_id.clone(), tenant.clone());
    let v = tauri::async_runtime::spawn_blocking(move || post_form(&login_url(&ten, "devicecode"), &[("client_id", &cid), ("scope", SCOPES)]))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(err) = v.get("error").and_then(Value::as_str) {
        let msg = v.get("error_description").and_then(Value::as_str).unwrap_or(err);
        return Err(msg.lines().next().unwrap_or(msg).to_string());
    }
    let user_code = v.get("user_code").and_then(Value::as_str).ok_or("réponse inattendue de Microsoft")?.to_string();
    let device_code = v.get("device_code").and_then(Value::as_str).ok_or("réponse inattendue de Microsoft")?.to_string();
    let verification_uri = v.get("verification_uri").and_then(Value::as_str).unwrap_or("https://microsoft.com/devicelogin").to_string();
    let interval = v.get("interval").and_then(Value::as_u64).unwrap_or(5);
    let expires = Instant::now() + Duration::from_secs(v.get("expires_in").and_then(Value::as_u64).unwrap_or(900));
    if let Ok(mut s) = STATE.lock() {
        s.pending = Some(Pending { user_code: user_code.clone(), verification_uri: verification_uri.clone(), expires });
        s.last_error = None;
        s.access = None;
    }
    let _ = crate::actions::open_target(&verification_uri);
    let app2 = app.clone();
    std::thread::spawn(move || poll(app2, client_id, tenant, device_code, interval, expires));
    Ok(CalendarStatus { connected: false, account: None, user_code: Some(user_code), verification_uri: Some(verification_uri), error: None })
}

#[tauri::command]
pub fn calendar_disconnect(app: AppHandle) -> Result<(), String> {
    if let Ok(mut s) = STATE.lock() {
        *s = State::default();
    }
    let p = store_path(&app)?;
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("calendar-changed", ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    id: String,
    subject: String,
    /// ISO 8601 UTC (suffixe Z).
    start: String,
    end: String,
    all_day: bool,
    location: String,
    join_url: Option<String>,
    web_link: Option<String>,
    show_as: String,
    cancelled: bool,
    organizer: String,
}

fn utc(v: &Value, key: &str) -> String {
    let s = v.pointer(&format!("/{key}/dateTime")).and_then(Value::as_str).unwrap_or_default();
    // Graph renvoie "2026-11-10T14:00:00.0000000" en UTC (en-tête Prefer) : on garde les millisecondes et on ajoute Z.
    let base = s.split('.').next().unwrap_or(s);
    if base.is_empty() { String::new() } else { format!("{base}Z") }
}

fn parse_events(v: &Value) -> Vec<CalendarEvent> {
    v.get("value")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|e| {
                    let s = |p: &str| e.pointer(p).and_then(Value::as_str).unwrap_or_default().to_string();
                    let join = e.pointer("/onlineMeeting/joinUrl").and_then(Value::as_str).or_else(|| e.get("onlineMeetingUrl").and_then(Value::as_str)).map(str::to_owned);
                    CalendarEvent {
                        id: s("/id"),
                        subject: Some(s("/subject")).filter(|x| !x.is_empty()).unwrap_or_else(|| "(sans titre)".into()),
                        start: utc(e, "start"),
                        end: utc(e, "end"),
                        all_day: e.get("isAllDay").and_then(Value::as_bool).unwrap_or(false),
                        location: s("/location/displayName"),
                        join_url: join,
                        web_link: e.get("webLink").and_then(Value::as_str).map(str::to_owned),
                        show_as: s("/showAs"),
                        cancelled: e.get("isCancelled").and_then(Value::as_bool).unwrap_or(false),
                        organizer: s("/organizer/emailAddress/name"),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Évènements entre `start` et `end` (ISO 8601 UTC), tous calendriers par défaut confondus.
#[tauri::command]
pub async fn calendar_events(app: AppHandle, client_id: String, tenant: String, start: String, end: String) -> Result<Vec<CalendarEvent>, String> {
    validate(&client_id, &tenant)?;
    let iso = |s: &str| s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || ":-.+".contains(c));
    if !iso(&start) || !iso(&end) {
        return Err("dates invalides".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let token = access_token(&app, &client_id, &tenant)?;
        let url = format!(
            "https://graph.microsoft.com/v1.0/me/calendarView?startDateTime={start}&endDateTime={end}&$top=100&$orderby=start/dateTime\
             &$select=subject,start,end,isAllDay,location,onlineMeeting,onlineMeetingUrl,webLink,showAs,isCancelled,organizer"
        );
        let v = graph_get(&token, &url)?;
        Ok(parse_events(&v))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_ids() {
        assert!(validate("2b0c1a5e-1111-2222-3333-444455556666", "westarter.fr").is_ok());
        assert!(validate("2b0c1a5e-1111-2222-3333-444455556666", "organizations").is_ok());
        assert!(validate("pas-un-guid", "westarter.fr").is_err());
        assert!(validate("2b0c1a5e-1111-2222-3333-444455556666", "a/b?x=1").is_err());
    }

    #[test]
    fn parses_graph_events() {
        let v = json!({ "value": [{
            "id": "A", "subject": "Point équipe",
            "start": { "dateTime": "2026-11-10T14:00:00.0000000", "timeZone": "UTC" },
            "end": { "dateTime": "2026-11-10T14:30:00.0000000", "timeZone": "UTC" },
            "isAllDay": false, "location": { "displayName": "Salle 2" },
            "onlineMeeting": { "joinUrl": "https://teams.microsoft.com/l/meetup-join/x" },
            "showAs": "busy", "isCancelled": false,
            "organizer": { "emailAddress": { "name": "Julien" } }
        }, { "id": "B", "subject": "", "start": { "dateTime": "2026-11-11T00:00:00.0000000" }, "end": { "dateTime": "2026-11-12T00:00:00.0000000" }, "isAllDay": true }] });
        let e = parse_events(&v);
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].start, "2026-11-10T14:00:00Z");
        assert_eq!(e[0].join_url.as_deref(), Some("https://teams.microsoft.com/l/meetup-join/x"));
        assert_eq!(e[0].location, "Salle 2");
        assert_eq!(e[1].subject, "(sans titre)");
        assert!(e[1].all_day);
    }
}

// ---------- Statut Teams ----------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    availability: String,
    activity: String,
}

#[tauri::command]
pub async fn teams_presence(app: AppHandle, client_id: String, tenant: String) -> Result<Presence, String> {
    validate(&client_id, &tenant)?;
    tauri::async_runtime::spawn_blocking(move || {
        let token = access_token(&app, &client_id, &tenant)?;
        let v = graph_get(&token, "https://graph.microsoft.com/v1.0/me/presence")?;
        let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
        Ok(Presence { availability: s("availability"), activity: s("activity") })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `availability` vide = revenir au statut automatique de Teams.
#[tauri::command]
pub async fn teams_set_presence(app: AppHandle, client_id: String, tenant: String, availability: String, hours: u32) -> Result<(), String> {
    validate(&client_id, &tenant)?;
    // Disponibilités acceptées par Graph et activité correspondante.
    let activity = match availability.as_str() {
        "" => "",
        "Available" => "Available",
        "Busy" => "Busy",
        "DoNotDisturb" => "DoNotDisturb",
        "BeRightBack" => "BeRightBack",
        "Away" => "Away",
        "Offline" => "OffWork",
        _ => return Err("statut inconnu".into()),
    }
    .to_string();
    let hours = hours.clamp(1, 24);
    tauri::async_runtime::spawn_blocking(move || {
        let token = access_token(&app, &client_id, &tenant)?;
        if availability.is_empty() {
            graph_post(&token, "https://graph.microsoft.com/v1.0/me/presence/clearUserPreferredPresence", serde_json::json!({}))
        } else {
            graph_post(
                &token,
                "https://graph.microsoft.com/v1.0/me/presence/setUserPreferredPresence",
                serde_json::json!({ "availability": availability, "activity": activity, "expirationDuration": format!("PT{hours}H") }),
            )
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
