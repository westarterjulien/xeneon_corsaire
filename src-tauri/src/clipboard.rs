//! Historique du presse-papiers (texte uniquement, en mémoire seulement : rien n'est écrit sur le disque).

use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX: usize = 15;
const MAX_LEN: usize = 20_000;

#[derive(Serialize, Clone)]
pub struct Clip {
    id: u64,
    text: String,
    /// Horodatage (ms depuis 1970).
    at: u64,
}

struct State {
    items: Vec<Clip>,
    last: String,
    next_id: u64,
}

static STATE: Mutex<State> = Mutex::new(State { items: Vec::new(), last: String::new(), next_id: 1 });

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Ajoute un texte en tête de l'historique (sans doublon).
pub fn remember(text: &str) {
    let Ok(mut s) = STATE.lock() else { return };
    if text.trim().is_empty() || text.len() > MAX_LEN || text == s.last {
        return;
    }
    s.last = text.to_string();
    s.items.retain(|c| c.text != text);
    let id = s.next_id;
    s.next_id += 1;
    s.items.insert(0, Clip { id, text: text.to_string(), at: now_ms() });
    s.items.truncate(MAX);
}

pub fn start() {
    std::thread::spawn(|| {
        let Ok(mut cb) = arboard::Clipboard::new() else { return };
        loop {
            if let Ok(t) = cb.get_text() {
                remember(&t);
            }
            std::thread::sleep(Duration::from_millis(800));
        }
    });
}

#[tauri::command]
pub fn clipboard_history() -> Vec<Clip> {
    STATE.lock().map(|s| s.items.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn clipboard_clear() {
    if let Ok(mut s) = STATE.lock() {
        s.items.clear();
    }
}

/// Remet un élément dans le presse-papiers et, si demandé, le colle dans l'appli d'avant.
#[tauri::command]
pub async fn clipboard_use(id: u64, paste: bool) -> Result<(), String> {
    let text = STATE.lock().ok().and_then(|s| s.items.iter().find(|c| c.id == id).map(|c| c.text.clone())).ok_or("élément introuvable")?;
    tauri::async_runtime::spawn_blocking(move || {
        arboard::Clipboard::new().and_then(|mut c| c.set_text(text.clone())).map_err(|e| e.to_string())?;
        if let Ok(mut s) = STATE.lock() {
            s.last = text.clone();
        }
        remember(&text);
        if paste {
            crate::foreground::focus_previous();
            crate::keys::send_combo("ctrl+v")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_unique_recent() {
        for t in ["a", "b", "a", " ", "c"] {
            remember(t);
        }
        let h = clipboard_history();
        assert_eq!(h.iter().map(|c| c.text.as_str()).collect::<Vec<_>>(), vec!["c", "a", "b"]);
    }
}
