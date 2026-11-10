use serde::Serialize;
use tauri::{Monitor, WebviewWindow};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    name: Option<String>,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale: f64,
    is_edge: bool,
}

/// Le Xeneon Edge est un écran 2560×720 (ratio 32:9 ≈ 3,56), éventuellement en portrait.
pub fn is_edge(m: &Monitor) -> bool {
    let s = m.size();
    let (long, short) = if s.width >= s.height { (s.width, s.height) } else { (s.height, s.width) };
    let ratio = long as f64 / short.max(1) as f64;
    (3.3..3.8).contains(&ratio)
}

pub fn place_on_edge(window: &WebviewWindow, preferred: Option<&str>) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let target = preferred
        .and_then(|name| monitors.iter().find(|m| m.name().map(String::as_str) == Some(name)))
        .or_else(|| monitors.iter().find(|m| is_edge(m)));
    let Some(m) = target else {
        return Err("aucun écran au format Xeneon Edge détecté, fenêtre laissée sur l'écran courant".into());
    };
    // On place d'abord la fenêtre sur l'Edge, puis on passe en plein écran sans bordure :
    // Windows la cale alors exactement sur l'écran (sans liseré dû au cadre ou à l'ombre d'une fenêtre classique).
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_position(*m.position()).map_err(|e| e.to_string())?;
    window.set_size(*m.size()).map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    crate::taskbar::set_target(m.position().x, m.position().y, m.size().width, m.size().height);
    Ok(())
}

#[tauri::command]
pub fn list_monitors(window: WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned(),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            scale: m.scale_factor(),
            is_edge: is_edge(m),
        })
        .collect())
}

#[tauri::command]
pub fn move_to_monitor(window: WebviewWindow, name: String) -> Result<(), String> {
    place_on_edge(&window, Some(&name))
}
