//! Appli au premier plan (pour changer de page automatiquement) et retour du focus
//! vers cette appli avant d'envoyer des touches (toucher l'Edge le lui prend).

use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Foreground {
    /// Nom de l'exécutable en minuscules, sans .exe (ex. "cs2", "teams").
    exe: String,
    title: String,
    /// La fenêtre couvre tout son écran (jeu en plein écran, vidéo…).
    fullscreen: bool,
}

struct Last {
    info: Foreground,
    hwnd: isize,
}

static LAST: Mutex<Option<Last>> = Mutex::new(None);

#[tauri::command]
pub fn foreground_app() -> Option<Foreground> {
    LAST.lock().ok().and_then(|g| g.as_ref().map(|l| l.info.clone()))
}

pub fn exe_stem(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path).to_lowercase();
    file.strip_suffix(".exe").unwrap_or(&file).to_string()
}

#[cfg(not(windows))]
pub fn start() {}
#[cfg(not(windows))]
pub fn focus_previous() {}

#[cfg(windows)]
pub fn start() {
    std::thread::spawn(|| loop {
        if let Some(l) = imp::current() {
            if let Ok(mut g) = LAST.lock() {
                *g = Some(l);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    });
}

/// Redonne le premier plan à la dernière appli utilisée (hors Edge Studio).
#[cfg(windows)]
pub fn focus_previous() {
    let hwnd = LAST.lock().ok().and_then(|g| g.as_ref().map(|l| l.hwnd));
    if let Some(h) = hwnd {
        imp::focus(h);
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsWindow, SetForegroundWindow};

    pub fn current() -> Option<Last> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            // Nos propres fenêtres (Edge, Studio) ne comptent pas.
            if pid == 0 || pid == std::process::id() {
                return None;
            }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            if !ok {
                return None;
            }
            let exe = exe_stem(&String::from_utf16_lossy(&buf[..len as usize]));
            // Le bureau et la barre des tâches ne sont pas des « applis ».
            if exe == "explorer" && GetWindowTextW(hwnd, &mut [0u16; 2]) == 0 {
                return None;
            }
            let mut tbuf = [0u16; 256];
            let n = GetWindowTextW(hwnd, &mut tbuf);
            let title = String::from_utf16_lossy(&tbuf[..n.max(0) as usize]);
            let mut r = RECT::default();
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            let fullscreen = GetWindowRect(hwnd, &mut r).is_ok()
                && GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool()
                && r.left <= mi.rcMonitor.left
                && r.top <= mi.rcMonitor.top
                && r.right >= mi.rcMonitor.right
                && r.bottom >= mi.rcMonitor.bottom
                && exe != "explorer";
            Some(Last { info: Foreground { exe, title, fullscreen }, hwnd: hwnd.0 as isize })
        }
    }

    pub fn focus(h: isize) {
        unsafe {
            let hwnd = HWND(h as *mut _);
            if IsWindow(hwnd).as_bool() {
                let _ = SetForegroundWindow(hwnd);
                // Laisse à Windows le temps de basculer avant l'envoi des touches.
                std::thread::sleep(std::time::Duration::from_millis(60));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn stems() {
        assert_eq!(super::exe_stem("C:\\Games\\Counter-Strike\\cs2.exe"), "cs2");
        assert_eq!(super::exe_stem("ms-teams.EXE"), "ms-teams");
    }
}
