//! Vraie luminosité (rétroéclairage) des écrans par DDC/CI, code VCP 0x10, via dxva2.
//! Tous les écrans ne répondent pas : la liste indique pour chacun s'il est réglable.
//!
//! Le bus DDC est lent (quelques dizaines de ms par échange) : un seul échange à la fois,
//! une seule lecture en cours (sinon on renvoie la dernière connue) et, pour les réglages,
//! seule la dernière valeur demandée par écran est appliquée (glisser un curseur n'empile rien).

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::WebviewWindow;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScreenBrightness {
    /// Nom Windows de l'écran (ex. \\.\DISPLAY2), le même que dans list_monitors.
    pub name: String,
    /// Description fournie par l'écran, à défaut vide.
    pub label: String,
    pub is_edge: bool,
    pub width: u32,
    pub height: u32,
    /// L'écran répond au DDC/CI.
    pub supported: bool,
    /// Luminosité en % (0 à 100).
    pub value: Option<u32>,
    pub error: Option<String>,
}

/// Un seul échange DDC/CI à la fois, tous écrans confondus.
static BUS: Mutex<()> = Mutex::new(());
static LAST: Mutex<Vec<ScreenBrightness>> = Mutex::new(Vec::new());
static READING: AtomicBool = AtomicBool::new(false);
/// Réglages en attente : (écran, %), un seul par écran.
static PENDING: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());
static WRITING: AtomicBool = AtomicBool::new(false);
/// Valeur maximale annoncée par chaque écran (évite une lecture avant chaque réglage).
static MAX: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());

pub fn to_percent(current: u32, max: u32) -> u32 {
    if max == 0 {
        return 0;
    }
    ((current as u64 * 100 + max as u64 / 2) / max as u64).min(100) as u32
}

pub fn from_percent(percent: u32, max: u32) -> u32 {
    ((percent.min(100) as u64 * max as u64 + 50) / 100) as u32
}

fn remember_max(name: &str, max: u32) {
    if let Ok(mut m) = MAX.lock() {
        m.retain(|(n, _)| n != name);
        m.push((name.to_string(), max));
    }
}

fn known_max(name: &str) -> Option<u32> {
    MAX.lock().ok()?.iter().find(|(n, _)| n == name).map(|(_, v)| *v)
}

fn pending_value(name: &str) -> Option<u32> {
    PENDING.lock().ok()?.iter().find(|(n, _)| n == name).map(|(_, v)| *v)
}

#[tauri::command]
pub async fn brightness_list(window: WebviewWindow) -> Result<Vec<ScreenBrightness>, String> {
    let monitors: Vec<(String, bool, u32, u32)> = window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .filter_map(|m| Some((m.name()?.clone(), crate::display::is_edge(m), m.size().width, m.size().height)))
        .collect();
    // Lecture déjà en cours (écran lent) : dernière liste connue plutôt qu'une file d'attente.
    if READING.swap(true, Ordering::SeqCst) {
        return Ok(LAST.lock().map(|l| l.clone()).unwrap_or_default());
    }
    let res = tauri::async_runtime::spawn_blocking(move || {
        monitors
            .into_iter()
            .map(|(name, is_edge, width, height)| {
                let (supported, value, label, error) = match ddc::read(&name) {
                    Ok((cur, max, label)) => {
                        remember_max(&name, max);
                        (true, Some(to_percent(cur, max)), label, None)
                    }
                    Err(e) => (false, None, String::new(), Some(e)),
                };
                // Réglage pas encore appliqué : on affiche la valeur demandée.
                let value = pending_value(&name).or(value);
                ScreenBrightness { name, label, is_edge, width, height, supported, value, error }
            })
            .collect::<Vec<_>>()
    })
    .await;
    READING.store(false, Ordering::SeqCst);
    let list = res.map_err(|e| e.to_string())?;
    if let Ok(mut l) = LAST.lock() {
        *l = list.clone();
    }
    Ok(list)
}

/// Règle la luminosité (en %) d'un écran. Rend la main tout de suite : l'écriture se fait en arrière-plan.
#[tauri::command]
pub fn brightness_set(name: String, value: u32) {
    if let Ok(mut p) = PENDING.lock() {
        p.retain(|(n, _)| *n != name);
        p.push((name, value.min(100)));
    }
    if WRITING.swap(true, Ordering::SeqCst) {
        return; // l'écrivain en cours prendra la nouvelle valeur
    }
    std::thread::spawn(|| loop {
        let next = {
            let Ok(mut p) = PENDING.lock() else {
                WRITING.store(false, Ordering::SeqCst);
                return;
            };
            if p.is_empty() {
                WRITING.store(false, Ordering::SeqCst);
                return;
            }
            p.remove(0)
        };
        let (name, value) = next;
        match ddc::write(&name, value) {
            Ok(()) => {
                if let Ok(mut l) = LAST.lock() {
                    if let Some(s) = l.iter_mut().find(|s| s.name == name) {
                        s.value = Some(value);
                    }
                }
            }
            Err(e) => eprintln!("[luminosité] {name} : {e}"),
        }
    });
}

#[cfg(windows)]
mod ddc {
    use super::{known_max, remember_max, BUS};
    use std::time::Duration;
    use windows::Win32::Devices::Display::{
        DestroyPhysicalMonitors, GetNumberOfPhysicalMonitorsFromHMONITOR, GetPhysicalMonitorsFromHMONITOR, GetVCPFeatureAndVCPFeatureReply, SetVCPFeature,
        PHYSICAL_MONITOR,
    };
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT, TRUE};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW};

    const BRIGHTNESS: u8 = 0x10;
    /// Pause recommandée par la norme DDC/CI entre deux commandes.
    const GAP: Duration = Duration::from_millis(50);

    fn wide(s: &[u16]) -> String {
        let n = s.iter().position(|&c| c == 0).unwrap_or(s.len());
        String::from_utf16_lossy(&s[..n]).trim().to_string()
    }

    unsafe extern "system" fn collect(h: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<(HMONITOR, String)>);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(h, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
            out.push((h, wide(&info.szDevice)));
        }
        TRUE
    }

    fn hmonitor(name: &str) -> Option<HMONITOR> {
        let mut found: Vec<(HMONITOR, String)> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(HDC::default(), None, Some(collect), LPARAM(&mut found as *mut _ as isize));
        }
        found.into_iter().find(|(_, n)| n.eq_ignore_ascii_case(name)).map(|(h, _)| h)
    }

    /// Ouvre l'écran physique derrière un écran Windows, le temps d'un échange.
    fn with_physical<T>(name: &str, f: impl FnOnce(&PHYSICAL_MONITOR) -> Result<T, String>) -> Result<T, String> {
        let h = hmonitor(name).ok_or("écran introuvable")?;
        let mut n = 0u32;
        unsafe { GetNumberOfPhysicalMonitorsFromHMONITOR(h, &mut n) }.map_err(|e| e.message().to_string())?;
        if n == 0 {
            return Err("aucun écran physique derrière cet affichage".into());
        }
        let mut list = vec![PHYSICAL_MONITOR::default(); n as usize];
        unsafe { GetPhysicalMonitorsFromHMONITOR(h, &mut list) }.map_err(|e| e.message().to_string())?;
        let res = f(&list[0]);
        unsafe {
            let _ = DestroyPhysicalMonitors(&list);
        }
        res
    }

    fn read_raw(m: &PHYSICAL_MONITOR) -> Option<(u32, u32)> {
        // Deux essais : un échange DDC échoue parfois ponctuellement.
        let handle = m.hPhysicalMonitor;
        for attempt in 0..2 {
            let (mut cur, mut max) = (0u32, 0u32);
            let ok = unsafe { GetVCPFeatureAndVCPFeatureReply(handle, BRIGHTNESS, None, &mut cur, Some(&mut max)) };
            std::thread::sleep(GAP);
            if ok != 0 && max > 0 {
                return Some((cur, max));
            }
            if attempt == 0 {
                std::thread::sleep(GAP);
            }
        }
        None
    }

    /// (valeur actuelle, maximum, description de l'écran)
    pub fn read(name: &str) -> Result<(u32, u32, String), String> {
        let _bus = BUS.lock().map_err(|e| e.to_string())?;
        with_physical(name, |m| {
            // Structure « packed » : copie du champ avant de l'emprunter.
            let desc = m.szPhysicalMonitorDescription;
            let label = wide(&desc);
            read_raw(m).map(|(c, x)| (c, x, label)).ok_or_else(|| "l'écran ne répond pas au DDC/CI".to_string())
        })
    }

    pub fn write(name: &str, percent: u32) -> Result<(), String> {
        let _bus = BUS.lock().map_err(|e| e.to_string())?;
        with_physical(name, |m| {
            let max = match known_max(name) {
                Some(x) => x,
                None => {
                    let (_, x) = read_raw(m).ok_or("l'écran ne répond pas au DDC/CI")?;
                    remember_max(name, x);
                    x
                }
            };
            let handle = m.hPhysicalMonitor;
            let ok = unsafe { SetVCPFeature(handle, BRIGHTNESS, super::from_percent(percent, max)) };
            std::thread::sleep(GAP);
            if ok != 0 {
                Ok(())
            } else {
                Err("l'écran a refusé le réglage".into())
            }
        })
    }
}

#[cfg(not(windows))]
mod ddc {
    pub fn read(_name: &str) -> Result<(u32, u32, String), String> {
        Err("réglage de la luminosité disponible uniquement sous Windows".into())
    }
    pub fn write(_name: &str, _percent: u32) -> Result<(), String> {
        Err("réglage de la luminosité disponible uniquement sous Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_round_trip() {
        assert_eq!(to_percent(50, 100), 50);
        assert_eq!(to_percent(0, 0), 0);
        assert_eq!(to_percent(255, 255), 100);
        assert_eq!(to_percent(128, 255), 50);
        assert_eq!(from_percent(50, 255), 128);
        assert_eq!(from_percent(150, 100), 100);
        for max in [100, 255, 80] {
            for p in 0..=100 {
                let raw = from_percent(p, max);
                assert!(raw <= max);
                assert!((to_percent(raw, max) as i32 - p as i32).abs() <= 1);
            }
        }
    }
}
