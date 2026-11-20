//! Toucher l'Edge sans déranger l'appli en cours (jeu en plein écran) :
//! - la fenêtre de l'Edge ne prend pas le focus (WS_EX_NOACTIVATE), le jeu reste au premier plan ;
//! - Windows déplace la souris là où l'on touche : on la remet à sa dernière position hors de l'Edge.
//!
//! En mode édition, la fenêtre redevient activable pour pouvoir taper au clavier (noms, réglages).

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use tauri::WebviewWindow;

/// Rectangle de l'Edge en pixels physiques : x, y, largeur, hauteur.
static EDGE: Mutex<Option<(i32, i32, i32, i32)>> = Mutex::new(None);
/// Dernière position de la souris hors de l'Edge.
static LAST_OUTSIDE: Mutex<Option<(i32, i32)>> = Mutex::new(None);
static ENABLED: AtomicBool = AtomicBool::new(true);
/// Fenêtre de l'Edge (HWND), pour réappliquer le style si Windows ou tao le réinitialisent (plein écran, changement d'écran).
static HWND_EDGE: AtomicIsize = AtomicIsize::new(0);

pub fn set_edge_rect(x: i32, y: i32, w: u32, h: u32) {
    if let Ok(mut e) = EDGE.lock() {
        *e = Some((x, y, w as i32, h as i32));
    }
}

pub fn inside(p: (i32, i32), r: (i32, i32, i32, i32)) -> bool {
    p.0 >= r.0 && p.0 < r.0 + r.2 && p.1 >= r.1 && p.1 < r.1 + r.3
}

/// Suit la souris (40 fois par seconde, coût négligeable) pour connaître sa dernière position hors de l'Edge.
pub fn start() {
    std::thread::spawn(|| {
        let mut tick = 0u32;
        loop {
            tick = tick.wrapping_add(1);
            // Toutes les secondes : style « sans activation » réappliqué s'il a été effacé.
            if tick.is_multiple_of(40) {
                let h = HWND_EDGE.load(Ordering::SeqCst);
                if h != 0 {
                    imp::set_no_activate(h, ENABLED.load(Ordering::SeqCst));
                }
            }
            if let (Some(p), Some(r)) = (imp::cursor(), EDGE.lock().ok().and_then(|e| *e)) {
                if !inside(p, r) {
                    if let Ok(mut l) = LAST_OUTSIDE.lock() {
                        *l = Some(p);
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    });
}

/// Fin d'un toucher sur l'Edge : la souris revient où elle était (si elle est restée sur l'Edge).
#[tauri::command]
pub fn cursor_restore() {
    if !ENABLED.load(Ordering::SeqCst) {
        return;
    }
    let (Some(r), Some(back)) = (EDGE.lock().ok().and_then(|e| *e), LAST_OUTSIDE.lock().ok().and_then(|l| *l)) else { return };
    if imp::cursor().is_some_and(|p| inside(p, r)) {
        imp::set_cursor(back);
    }
}

/// `keep_focus` : le toucher ne prend ni le focus ni la souris. Désactivé en mode édition (saisie au clavier)
/// ou par l'option des réglages.
#[tauri::command]
pub fn touch_guard(window: WebviewWindow, keep_focus: bool) -> Result<(), String> {
    ENABLED.store(keep_focus, Ordering::SeqCst);
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    HWND_EDGE.store(hwnd, Ordering::SeqCst);
    imp::set_no_activate(hwnd, keep_focus);
    Ok(())
}

#[cfg(windows)]
mod imp {
    use windows::Win32::Foundation::{HWND, POINT};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowLongPtrW, SetCursorPos, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};

    pub fn cursor() -> Option<(i32, i32)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p) }.ok().map(|_| (p.x, p.y))
    }

    pub fn set_cursor(p: (i32, i32)) {
        unsafe {
            let _ = SetCursorPos(p.0, p.1);
        }
    }

    pub fn set_no_activate(h: isize, on: bool) {
        unsafe {
            let hwnd = HWND(h as *mut _);
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let flag = WS_EX_NOACTIVATE.0 as isize;
            let next = if on { style | flag } else { style & !flag };
            if next != style {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn cursor() -> Option<(i32, i32)> {
        None
    }
    pub fn set_cursor(_p: (i32, i32)) {}
    pub fn set_no_activate(_h: isize, _on: bool) {}
}

#[cfg(test)]
mod tests {
    use super::inside;

    #[test]
    fn inside_rect() {
        let edge = (2560, 1440, 2560, 720);
        assert!(inside((2560, 1440), edge));
        assert!(inside((5119, 2159), edge));
        assert!(!inside((5120, 1500), edge));
        assert!(!inside((100, 100), edge));
    }
}
