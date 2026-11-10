//! Masque la barre des tâches Windows uniquement sur l'écran de l'Edge, et la réaffiche en quittant.
//! Explorer la fait parfois réapparaître (changement d'écran, redémarrage d'Explorer) : on vérifie toutes les 2 s.

use std::sync::Mutex;

struct State {
    enabled: bool,
    /// Rectangle de l'Edge en pixels physiques : x, y, largeur, hauteur.
    target: Option<(i32, i32, i32, i32)>,
    /// Fenêtres de barre des tâches masquées par nous (à réafficher).
    hidden: Vec<isize>,
}

static STATE: Mutex<State> = Mutex::new(State { enabled: true, target: None, hidden: Vec::new() });

pub fn set_target(x: i32, y: i32, w: u32, h: u32) {
    if let Ok(mut s) = STATE.lock() {
        s.target = Some((x, y, w as i32, h as i32));
    }
    apply();
}

pub fn set_enabled(enabled: bool) {
    if let Ok(mut s) = STATE.lock() {
        s.enabled = enabled;
    }
    apply();
}

#[tauri::command]
pub fn taskbar_set(hidden: bool) {
    set_enabled(hidden);
}

/// Lance la surveillance en tâche de fond.
pub fn start() {
    std::thread::spawn(|| loop {
        apply();
        std::thread::sleep(std::time::Duration::from_secs(2));
    });
}

#[cfg(windows)]
pub fn apply() {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetWindowRect, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOWNA};

    let Ok(mut s) = STATE.lock() else { return };
    if !s.enabled || s.target.is_none() {
        // Réaffiche ce que nous avions masqué.
        for h in s.hidden.drain(..) {
            unsafe {
                let _ = ShowWindow(HWND(h as *mut _), SW_SHOWNA);
            }
        }
        return;
    }
    let (x, y, w_, h_) = s.target.unwrap_or_default();
    // Barres des tâches des écrans secondaires (classe Shell_SecondaryTrayWnd) ; l'Edge n'est jamais l'écran principal.
    let mut prev = HWND::default();
    loop {
        let found = unsafe { FindWindowExW(HWND::default(), prev, w!("Shell_SecondaryTrayWnd"), PCWSTR::null()) };
        let Ok(hwnd) = found else { break };
        if hwnd.is_invalid() {
            break;
        }
        prev = hwnd;
        let mut r = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut r) }.is_err() {
            continue;
        }
        let (cx, cy) = ((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        let on_edge = cx >= x && cx < x + w_ && cy >= y && cy < y + h_;
        if on_edge && unsafe { IsWindowVisible(hwnd) }.as_bool() {
            unsafe {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
            let id = hwnd.0 as isize;
            if !s.hidden.contains(&id) {
                s.hidden.push(id);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn apply() {}

/// À appeler en quittant : réaffiche les barres masquées.
pub fn restore() {
    set_enabled(false);
}
