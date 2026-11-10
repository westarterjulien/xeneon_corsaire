//! Batteries des périphériques Logitech via l'agent local de G HUB (ws://localhost:9010).
//! Interface non officielle (celle qu'utilise l'appli G HUB elle-même) : tolérante aux variations de format.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    net::TcpStream,
    sync::Mutex,
    time::{Duration, Instant},
};
use tungstenite::{client::IntoClientRequest, http::HeaderValue, stream::MaybeTlsStream, Message, WebSocket};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    id: String,
    name: String,
    /// "mouse", "keyboard", "headset" ou "other".
    kind: String,
    percentage: Option<f64>,
    charging: bool,
}

type Cached = Option<(Instant, Result<Vec<Battery>, String>)>;
static CACHE: Mutex<Cached> = Mutex::new(None);

#[tauri::command]
pub async fn ghub_batteries() -> Result<Vec<Battery>, String> {
    if let Some((t, r)) = CACHE.lock().ok().and_then(|g| g.clone()) {
        if t.elapsed() < Duration::from_secs(20) {
            return r;
        }
    }
    let r = tauri::async_runtime::spawn_blocking(read).await.map_err(|e| e.to_string())?;
    if let Ok(mut g) = CACHE.lock() {
        *g = Some((Instant::now(), r.clone()));
    }
    r
}

type Ws = WebSocket<MaybeTlsStream<TcpStream>>;

fn connect() -> Result<Ws, String> {
    let stream = TcpStream::connect_timeout(&"127.0.0.1:9010".parse().expect("adresse"), Duration::from_millis(800))
        .map_err(|_| "G HUB n'est pas lancé".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    let mut req = "ws://localhost:9010".into_client_request().map_err(|e| e.to_string())?;
    let h = req.headers_mut();
    h.insert("Origin", HeaderValue::from_static("file://"));
    h.insert("Sec-WebSocket-Protocol", HeaderValue::from_static("json"));
    let (ws, _) = tungstenite::client(req, MaybeTlsStream::Plain(stream)).map_err(|e| format!("G HUB refuse la connexion : {e}"))?;
    Ok(ws)
}

/// Envoie une requête GET et attend la réponse au même chemin (l'agent envoie aussi d'autres messages).
fn get(ws: &mut Ws, path: &str) -> Result<Value, String> {
    let msg = json!({ "msgId": "", "verb": "GET", "path": path }).to_string();
    ws.send(Message::text(msg)).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        let m = match ws.read() {
            Ok(m) => m,
            Err(tungstenite::Error::Io(e)) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(e) => return Err(e.to_string()),
        };
        let Ok(text) = m.to_text() else { continue };
        let Ok(v) = serde_json::from_str::<Value>(text) else { continue };
        if v.get("path").and_then(Value::as_str) == Some(path) {
            return Ok(v.get("payload").cloned().unwrap_or(Value::Null));
        }
    }
    Err(format!("pas de réponse de G HUB pour {path}"))
}

fn kind(t: &str) -> &'static str {
    let t = t.to_ascii_lowercase();
    if t.contains("mouse") {
        "mouse"
    } else if t.contains("keyboard") {
        "keyboard"
    } else if t.contains("headset") || t.contains("audio") {
        "headset"
    } else {
        "other"
    }
}

pub fn parse_devices(payload: &Value) -> Vec<(String, String, String)> {
    let list = payload
        .get("deviceInfos")
        .or_else(|| payload.get("devices"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    list.iter()
        .filter_map(|d| {
            let id = d.get("id").and_then(Value::as_str)?.to_string();
            let name = ["extendedDisplayName", "displayName", "name", "modelId"]
                .iter()
                .find_map(|k| d.get(*k).and_then(Value::as_str).filter(|s| !s.is_empty()))
                .unwrap_or("Périphérique")
                .to_string();
            let t = d.get("deviceType").and_then(Value::as_str).unwrap_or("");
            Some((id, name, kind(t).to_string()))
        })
        .collect()
}

pub fn parse_battery(payload: &Value) -> (Option<f64>, bool) {
    let pct = ["percentage", "batteryLevel", "level"].iter().find_map(|k| payload.get(*k).and_then(Value::as_f64));
    let charging = ["charging", "isCharging"].iter().find_map(|k| payload.get(*k).and_then(Value::as_bool)).unwrap_or(false);
    (pct, charging)
}

fn read() -> Result<Vec<Battery>, String> {
    let mut ws = connect()?;
    let devices = parse_devices(&get(&mut ws, "/devices/list")?);
    let mut out = Vec::new();
    for (id, name, kind) in devices {
        // Les périphériques filaires n'ont pas de batterie : la requête échoue ou ne renvoie rien.
        let Ok(state) = get(&mut ws, &format!("/battery/{id}/state")) else { continue };
        let (percentage, charging) = parse_battery(&state);
        if percentage.is_none() {
            continue;
        }
        out.push(Battery { id, name, kind, percentage, charging });
    }
    let _ = ws.close(None);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_payloads() {
        let d = parse_devices(&json!({ "deviceInfos": [
            { "id": "dev00000001", "extendedDisplayName": "PRO X SUPERLIGHT", "deviceType": "MOUSE" },
            { "id": "dev00000002", "displayName": "G915", "deviceType": "KEYBOARD" },
            { "nope": true }
        ] }));
        assert_eq!(d.len(), 2);
        assert_eq!(d[0], ("dev00000001".into(), "PRO X SUPERLIGHT".into(), "mouse".into()));
        assert_eq!(d[1].2, "keyboard");
        assert_eq!(parse_battery(&json!({ "percentage": 72, "charging": true })), (Some(72.0), true));
        assert_eq!(parse_battery(&json!({ "batteryLevel": 15.5 })), (Some(15.5), false));
        assert_eq!(parse_battery(&json!({})), (None, false));
    }
}
