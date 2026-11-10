//! Widgets perso : dossiers dans %APPDATA%\fr.westarter.edgestudio\widgets\<id>\ (widget.json + index.html),
//! servis par le protocole `edgewidget://` et chargés dans une iframe isolée, sans recompiler l'appli.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{http::Response, AppHandle, Manager, Runtime};

const SDK_JS: &str = include_str!("../../public/user-widgets/_sdk/edge.js");
const SDK_CSS: &str = include_str!("../../public/user-widgets/_sdk/edge.css");
const SDK_FONT: &[u8] = include_bytes!("../../public/user-widgets/_sdk/inter.woff2");

/// Exemple installé au premier lancement.
const EXAMPLE: &[(&str, &str)] = &[
    ("pomodoro/widget.json", include_str!("../../public/user-widgets/pomodoro/widget.json")),
    ("pomodoro/index.html", include_str!("../../public/user-widgets/pomodoro/index.html")),
];

/// Modèle utilisé par « Créer un widget ».
const TEMPLATE: &[(&str, &str)] = &[
    ("widget.json", include_str!("../../templates/widget/widget.json")),
    ("index.html", include_str!("../../templates/widget/index.html")),
];

pub fn dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("widgets"))
}

/// Crée le dossier et y dépose l'exemple, uniquement s'il n'existe pas encore.
pub fn seed<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let d = dir(app)?;
    if d.exists() {
        return Ok(());
    }
    for (rel, content) in EXAMPLE {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap_or(&d)).map_err(|e| e.to_string())?;
        fs::write(p, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Empreinte du dossier : change dès qu'un fichier est modifié, ajouté ou supprimé (rechargement à chaud).
fn revision(path: &Path) -> u64 {
    fn walk(p: &Path, max: &mut u64, count: &mut u64) {
        let Ok(entries) = fs::read_dir(p) else { return };
        for e in entries.flatten() {
            *count += 1;
            if let Ok(meta) = e.metadata() {
                if let Ok(t) = meta.modified().and_then(|m| m.duration_since(UNIX_EPOCH).map_err(std::io::Error::other)) {
                    *max = (*max).max(t.as_millis() as u64);
                }
                if meta.is_dir() {
                    walk(&e.path(), max, count);
                }
            }
        }
    }
    let (mut max, mut count) = (0, 0);
    walk(path, &mut max, &mut count);
    max.wrapping_add(count)
}

#[derive(Serialize)]
pub struct UserWidgets {
    dir: String,
    revision: u64,
    widgets: Vec<Value>,
}

#[tauri::command]
pub fn user_widgets(app: AppHandle) -> Result<UserWidgets, String> {
    let d = dir(&app)?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let mut entries: Vec<_> = fs::read_dir(&d).map_err(|e| e.to_string())?.flatten().filter(|e| e.path().is_dir()).collect();
    entries.sort_by_key(|e| e.file_name());
    let mut widgets = Vec::new();
    for entry in entries {
        let id = entry.file_name().to_string_lossy().to_string();
        if id.starts_with('_') || id.starts_with('.') {
            continue;
        }
        let manifest = match fs::read_to_string(entry.path().join("widget.json")) {
            Err(_) => json!({ "id": id, "error": "widget.json manquant" }),
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Object(mut m)) => {
                    m.insert("id".into(), json!(id));
                    Value::Object(m)
                }
                Ok(_) => json!({ "id": id, "error": "widget.json doit contenir un objet { … }" }),
                Err(e) => json!({ "id": id, "error": format!("widget.json invalide : {e}") }),
            },
        };
        widgets.push(manifest);
    }
    Ok(UserWidgets { dir: d.display().to_string(), revision: revision(&d), widgets })
}

fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().to_lowercase().chars() {
        let c = match c {
            'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "mon-widget".into() } else { out }
}

/// Crée un nouveau widget à partir du modèle et renvoie son identifiant (nom du dossier).
#[tauri::command]
pub fn create_user_widget(app: AppHandle, name: String) -> Result<String, String> {
    let d = dir(&app)?;
    let base = slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while d.join(&id).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    let target = d.join(&id);
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    let display = name.trim().replace('"', "'");
    for (rel, content) in TEMPLATE {
        fs::write(target.join(rel), content.replace("{{NAME}}", if display.is_empty() { "Mon widget" } else { &display })).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

/// Chemin relatif sûr : pas de remontée (`..`), pas de lecteur ni d'antislash.
pub fn safe_relative(path: &str) -> Option<String> {
    let p = percent_decode(path.split('?').next().unwrap_or("").trim_start_matches('/'));
    if p.is_empty() || p.contains('\\') || p.contains(':') || p.split('/').any(|c| c == ".." || c == "." || c.is_empty()) {
        return None;
    }
    Some(p)
}

fn respond(status: u16, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Gestionnaire du protocole `edgewidget://localhost/<id>/<fichier>` (Windows : http://edgewidget.localhost/…).
pub fn serve<R: Runtime>(app: &AppHandle<R>, path: &str) -> Response<Vec<u8>> {
    let Some(rel) = safe_relative(path) else {
        return respond(403, "text/plain", b"chemin refuse".to_vec());
    };
    match rel.as_str() {
        "_sdk/edge.js" => return respond(200, mime(&rel), SDK_JS.as_bytes().to_vec()),
        "_sdk/edge.css" => return respond(200, mime(&rel), SDK_CSS.as_bytes().to_vec()),
        "_sdk/inter.woff2" => return respond(200, mime(&rel), SDK_FONT.to_vec()),
        _ => {}
    }
    let Ok(d) = dir(app) else {
        return respond(500, "text/plain", b"dossier introuvable".to_vec());
    };
    match fs::read(d.join(&rel)) {
        Ok(bytes) => respond(200, mime(&rel), bytes),
        Err(_) => respond(404, "text/plain", format!("introuvable : {rel}").into_bytes()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        assert_eq!(safe_relative("/pomodoro/index.html").as_deref(), Some("pomodoro/index.html"));
        assert_eq!(safe_relative("/mon%20widget/index.html?v=3").as_deref(), Some("mon widget/index.html"));
        assert!(safe_relative("/../config.json").is_none());
        assert!(safe_relative("/a/%2e%2e/b").is_none());
        assert!(safe_relative("/C:/Windows/win.ini").is_none());
        assert!(safe_relative("/a\\..\\b").is_none());
        assert!(safe_relative("/").is_none());
    }

    #[test]
    fn slugs() {
        assert_eq!(slug("Météo du Jour !"), "meteo-du-jour");
        assert_eq!(slug("   "), "mon-widget");
    }
}
