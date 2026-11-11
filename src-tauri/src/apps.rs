//! Applications installées (menu Démarrer, y compris les applis du Store) et leurs icônes.
//! Lancement : `shell:AppsFolder\<AppID>` (voir actions::open_target).

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Serialize, Deserialize, Clone)]
pub struct InstalledApp {
    #[serde(alias = "Name")]
    pub name: String,
    #[serde(alias = "AppID")]
    pub id: String,
}

static LIST: Mutex<Option<(Instant, Vec<InstalledApp>)>> = Mutex::new(None);
static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

/// Liste des applis (mise en cache 5 minutes).
#[tauri::command]
pub async fn installed_apps() -> Result<Vec<InstalledApp>, String> {
    if let Some((t, l)) = LIST.lock().ok().and_then(|g| g.clone()) {
        if t.elapsed() < Duration::from_secs(300) {
            return Ok(l);
        }
    }
    let list = tauri::async_runtime::spawn_blocking(imp::list).await.map_err(|e| e.to_string())??;
    if let Ok(mut g) = LIST.lock() {
        *g = Some((Instant::now(), list.clone()));
    }
    Ok(list)
}

/// Icône PNG (data URL) d'une appli, ou null.
#[tauri::command]
pub async fn app_icon(id: String) -> Option<String> {
    if id.len() > 512 {
        return None;
    }
    if let Some(v) = ICONS.lock().ok().and_then(|g| g.as_ref().and_then(|m| m.get(&id).cloned())) {
        return v;
    }
    let key = id.clone();
    let icon = tauri::async_runtime::spawn_blocking(move || imp::icon(&key)).await.ok().flatten();
    if let Ok(mut g) = ICONS.lock() {
        g.get_or_insert_with(HashMap::new).insert(id, icon.clone());
    }
    icon
}

/// Chemin de ShareX s'il est installé (registre « App Paths », dossiers habituels, version Steam).
#[tauri::command]
pub fn sharex_path() -> Option<String> {
    imp::sharex()
}

pub fn parse_list(json: &str) -> Result<Vec<InstalledApp>, String> {
    // PowerShell renvoie un objet seul (et non un tableau) s'il n'y a qu'une appli.
    let v: serde_json::Value = serde_json::from_str(json.trim().trim_start_matches('\u{feff}')).map_err(|e| format!("liste illisible : {e}"))?;
    let items = match v {
        serde_json::Value::Array(a) => a,
        o @ serde_json::Value::Object(_) => vec![o],
        _ => Vec::new(),
    };
    let mut apps: Vec<InstalledApp> = items.into_iter().filter_map(|i| serde_json::from_value(i).ok()).filter(|a: &InstalledApp| !a.name.is_empty() && !a.id.is_empty()).collect();
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps.dedup_by(|a, b| a.id == b.id);
    Ok(apps)
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn list() -> Result<Vec<InstalledApp>, String> {
        Err("disponible uniquement sous Windows".into())
    }
    pub fn icon(_: &str) -> Option<String> {
        None
    }
    pub fn sharex() -> Option<String> {
        None
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use base64::Engine;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};

    pub fn list() -> Result<Vec<InstalledApp>, String> {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let out = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("PowerShell indisponible : {e}"))?;
        parse_list(&String::from_utf8_lossy(&out.stdout))
    }

    /// Lit une valeur texte du registre (None si absente).
    fn reg_str(root: windows::Win32::System::Registry::HKEY, key: &str, value: Option<&str>) -> Option<String> {
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::System::Registry::{RegGetValueW, RRF_RT_REG_SZ};
        let k = HSTRING::from(key);
        let v = value.map(HSTRING::from);
        let mut buf = [0u16; 520];
        let mut size = (buf.len() * 2) as u32;
        let ok = unsafe {
            RegGetValueW(root, &k, v.as_ref().map(|h| PCWSTR(h.as_ptr())).unwrap_or(PCWSTR::null()), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut size))
        }
        .is_ok();
        ok.then(|| String::from_utf16_lossy(&buf[..(size as usize / 2).saturating_sub(1)]).trim_matches('"').to_string())
    }

    /// Le fichier existe (y compris les alias d'exécution des applis du Store, qui sont des points d'analyse).
    fn present(p: &str) -> bool {
        !p.is_empty() && std::fs::symlink_metadata(p).is_ok()
    }

    pub fn sharex() -> Option<String> {
        use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        let env = |k: &str| std::env::var(k).unwrap_or_default();
        let mut candidates: Vec<String> = Vec::new();
        // 1. Chemin déclaré par l'installateur (App Paths) et dossier d'installation du désinstalleur.
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            if let Some(p) = reg_str(root, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ShareX.exe", None) {
                candidates.push(p);
            }
            for key in [
                "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShareX_is1",
                "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShareX_is1",
            ] {
                if let Some(dir) = reg_str(root, key, Some("InstallLocation")) {
                    candidates.push(format!("{}\\ShareX.exe", dir.trim_end_matches('\\')));
                }
            }
        }
        // 2. Dossiers habituels, Steam, et alias de la version Microsoft Store.
        candidates.extend([
            format!("{}\\ShareX\\ShareX.exe", env("ProgramFiles")),
            format!("{}\\ShareX\\ShareX.exe", env("ProgramFiles(x86)")),
            format!("{}\\Programs\\ShareX\\ShareX.exe", env("LOCALAPPDATA")),
            format!("{}\\Steam\\steamapps\\common\\ShareX\\ShareX.exe", env("ProgramFiles(x86)")),
            format!("{}\\Microsoft\\WindowsApps\\ShareX.exe", env("LOCALAPPDATA")),
        ]);
        if let Some(p) = candidates.into_iter().find(|p| present(p)) {
            return Some(p);
        }
        // 3. Dans le PATH.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let out = Command::new("where.exe").arg("ShareX.exe").creation_flags(CREATE_NO_WINDOW).output().ok()?;
        String::from_utf8_lossy(&out.stdout).lines().map(str::trim).find(|l| present(l)).map(str::to_owned)
    }

    /// Icône de l'appli via le Shell Windows (la même que dans le menu Démarrer), encodée en PNG.
    pub fn icon(id: &str) -> Option<String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            // Programme ajouté par son chemin (C:\…\app.exe) ou appli du menu Démarrer (AppID).
            let parsing = if id.contains(":\\") { id.to_string() } else { format!("shell:AppsFolder\\{id}") };
            let item: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(parsing), None).ok()?;
            let hbmp = item.GetImage(SIZE { cx: 96, cy: 96 }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK).ok()?;
            let mut bm = BITMAP::default();
            let got = GetObjectW(hbmp, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _));
            let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
            if got == 0 || w <= 0 || h <= 0 || w > 512 || h > 512 {
                let _ = DeleteObject(hbmp);
                return None;
            }
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // lignes de haut en bas
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            let dc = GetDC(None);
            let lines = GetDIBits(dc, hbmp, 0, h as u32, Some(px.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
            ReleaseDC(None, dc);
            let _ = DeleteObject(hbmp);
            if lines == 0 {
                return None;
            }
            to_png(&mut px, w as u32, h as u32)
        }
    }

    /// BGRA prémultiplié → RGBA, puis PNG en data URL.
    fn to_png(px: &mut [u8], w: u32, h: u32) -> Option<String> {
        let has_alpha = px.chunks(4).any(|p| p[3] != 0);
        for p in px.chunks_mut(4) {
            p.swap(0, 2);
            if !has_alpha {
                p[3] = 255;
            } else if p[3] > 0 && p[3] < 255 {
                let a = p[3] as u32;
                for c in &mut p[..3] {
                    *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
                }
            }
        }
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, w, h);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut writer = enc.write_header().ok()?;
            writer.write_image_data(px).ok()?;
        }
        Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_powershell_output() {
        let l = parse_list(r#"[{"Name":"Spotify","AppID":"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"},{"Name":"Bloc-notes","AppID":"{1AC14E77}\\notepad.exe"},{"Name":"","AppID":"x"}]"#).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].name, "Bloc-notes");
        let one = parse_list("\u{feff}{\"Name\":\"Steam\",\"AppID\":\"Valve.Steam\"}").unwrap();
        assert_eq!(one[0].id, "Valve.Steam");
        assert!(parse_list("").is_err());
    }
}
