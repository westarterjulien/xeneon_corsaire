//! Home Assistant : états des entités et appels de services via l'API REST.
//! Le jeton d'accès longue durée est chiffré avec DPAPI ; la configuration ne contient que l'adresse.

use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::HashMap, fs, path::PathBuf, sync::Arc, time::Duration};
use tauri::{AppHandle, Manager};

fn agent() -> Result<ureq::Agent, String> {
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    Ok(ureq::AgentBuilder::new().tls_connector(Arc::new(tls)).timeout(Duration::from_secs(8)).build())
}

/// "http://192.168.1.10:8123/" → "http://192.168.1.10:8123"
pub fn normalize(url: &str) -> Result<String, String> {
    let u = url.trim().trim_end_matches('/');
    let ok = (u.starts_with("http://") || u.starts_with("https://")) && u.len() < 300 && !u.contains(char::is_whitespace);
    if ok { Ok(u.to_string()) } else { Err("adresse invalide (ex. http://homeassistant.local:8123)".into()) }
}

fn store(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("homeassistant.token"))
}

fn tokens(app: &AppHandle) -> HashMap<String, String> {
    store(app)
        .ok()
        .and_then(|p| fs::read(p).ok())
        .and_then(|raw| crate::secret::unprotect(&raw).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn token(app: &AppHandle, url: &str) -> Result<String, String> {
    tokens(app).remove(url).ok_or_else(|| "jeton Home Assistant non enregistré".into())
}

fn call(method: &str, url: &str, token: &str, body: Option<Value>) -> Result<Value, String> {
    let req = agent()?.request(method, url).set("Authorization", &format!("Bearer {token}"));
    let res = match body {
        Some(b) => req.send_json(b),
        None => req.call(),
    };
    match res {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(401, _)) => Err("jeton refusé par Home Assistant".into()),
        Err(ureq::Error::Status(code, _)) => Err(format!("Home Assistant a répondu {code}")),
        Err(e) => Err(format!("Home Assistant injoignable : {e}")),
    }
}

/// Vérifie l'adresse et le jeton, puis enregistre le jeton (chiffré).
#[tauri::command]
pub async fn ha_save(app: AppHandle, url: String, token: String) -> Result<(), String> {
    let url = normalize(&url)?;
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("jeton vide".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        call("GET", &format!("{url}/api/"), &token, None)?;
        let mut all = tokens(&app);
        all.insert(url, token);
        let p = store(&app)?;
        if let Some(d) = p.parent() {
            fs::create_dir_all(d).map_err(|e| e.to_string())?;
        }
        fs::write(p, crate::secret::protect(&serde_json::to_vec(&all).map_err(|e| e.to_string())?)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ha_has_token(app: AppHandle, url: String) -> bool {
    normalize(&url).map(|u| tokens(&app).contains_key(&u)).unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    entity_id: String,
    domain: String,
    name: String,
    state: String,
    unit: Option<String>,
    device_class: Option<String>,
}

pub fn parse_states(v: &Value) -> Vec<Entity> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let id = e.get("entity_id")?.as_str()?.to_string();
                    let attr = e.get("attributes");
                    let a = |k: &str| attr.and_then(|x| x.get(k)).and_then(Value::as_str).map(str::to_owned);
                    Some(Entity {
                        domain: id.split('.').next().unwrap_or_default().to_string(),
                        name: a("friendly_name").unwrap_or_else(|| id.clone()),
                        state: e.get("state").and_then(Value::as_str).unwrap_or_default().to_string(),
                        unit: a("unit_of_measurement"),
                        device_class: a("device_class"),
                        entity_id: id,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn ha_states(app: AppHandle, url: String) -> Result<Vec<Entity>, String> {
    let url = normalize(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let t = token(&app, &url)?;
        Ok(parse_states(&call("GET", &format!("{url}/api/states"), &t, None)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Appelle un service (ex. light.toggle) sur une entité.
#[tauri::command]
pub async fn ha_service(app: AppHandle, url: String, domain: String, service: String, entity_id: String) -> Result<(), String> {
    let url = normalize(&url)?;
    let ident = |s: &str| !s.is_empty() && s.len() < 128 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    if !ident(&domain) || !ident(&service) || !ident(&entity_id) {
        return Err("service invalide".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let t = token(&app, &url)?;
        call("POST", &format!("{url}/api/services/{domain}/{service}"), &t, Some(json!({ "entity_id": entity_id }))).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_parses() {
        assert_eq!(normalize(" http://ha.local:8123/ ").unwrap(), "http://ha.local:8123");
        assert!(normalize("ftp://x").is_err());
        let e = parse_states(&json!([
            { "entity_id": "light.salon", "state": "on", "attributes": { "friendly_name": "Salon" } },
            { "entity_id": "sensor.temp", "state": "21.5", "attributes": { "unit_of_measurement": "°C", "device_class": "temperature" } }
        ]));
        assert_eq!(e.len(), 2);
        assert_eq!((e[0].domain.as_str(), e[0].name.as_str(), e[0].state.as_str()), ("light", "Salon", "on"));
        assert_eq!(e[1].unit.as_deref(), Some("°C"));
        assert_eq!(e[1].name, "sensor.temp");
    }
}
