use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub fn read(app: &AppHandle) -> Option<Value> {
    let p = path(app).ok()?;
    let raw = fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Configuration (pages, widgets, thème) stockée dans %APPDATA%\fr.westarter.edgestudio\config.json.
#[tauri::command]
pub fn load_config(app: AppHandle) -> Option<Value> {
    read(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Value) -> Result<(), String> {
    let p = path(&app)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Écriture atomique : fichier temporaire puis renommage.
    let tmp = p.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Lancement avec Windows (réglable dans le Studio).
#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let l = app.autolaunch();
    if enabled { l.enable() } else { l.disable() }.map_err(|e| e.to_string())
}
