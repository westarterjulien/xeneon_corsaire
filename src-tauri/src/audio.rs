//! Son : volume et sourdine de la sortie et du micro par défaut, plus le volume de chaque appli (mélangeur).

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    name: String,
    /// 0 à 100.
    volume: f64,
    muted: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppVolume {
    pid: u32,
    name: String,
    volume: f64,
    muted: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    output: Option<Endpoint>,
    input: Option<Endpoint>,
    apps: Vec<AppVolume>,
}

#[tauri::command]
pub async fn audio_state() -> Result<AudioState, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    // Une seule lecture à la fois : pas d'empilement si le service audio de Windows est occupé.
    static BUSY: AtomicBool = AtomicBool::new(false);
    static LAST: Mutex<Option<AudioState>> = Mutex::new(None);
    if BUSY.swap(true, Ordering::SeqCst) {
        if let Some(v) = LAST.lock().ok().and_then(|g| g.clone()) {
            return Ok(v);
        }
        return Err("lecture du son en cours".into());
    }
    let r = tauri::async_runtime::spawn_blocking(imp::state).await;
    BUSY.store(false, Ordering::SeqCst);
    let v = r.map_err(|e| e.to_string())??;
    if let Ok(mut g) = LAST.lock() {
        *g = Some(v.clone());
    }
    Ok(v)
}

/// `target` : "output", "input" ou "app:<pid>". `volume` de 0 à 100.
#[tauri::command]
pub async fn audio_set(target: String, volume: Option<f64>, muted: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || imp::set(&target, volume, muted)).await.map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn state() -> Result<AudioState, String> {
        Err("disponible uniquement sous Windows".into())
    }
    pub fn set(_: &str, _: Option<f64>, _: Option<bool>) -> Result<(), String> {
        Err("disponible uniquement sous Windows".into())
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::core::{Interface, Result as WinResult, GUID, PWSTR};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, eRender, AudioSessionStateExpired, EDataFlow, IAudioSessionControl2, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator,
        ISimpleAudioVolume, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};

    fn com() {
        // Déjà initialisé sur ce fil : l'erreur est sans conséquence.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    fn device(flow: EDataFlow) -> WinResult<IMMDevice> {
        unsafe {
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            en.GetDefaultAudioEndpoint(flow, eConsole)
        }
    }

    fn endpoint(flow: EDataFlow) -> WinResult<Endpoint> {
        unsafe {
            let dev = device(flow)?;
            let vol: IAudioEndpointVolume = dev.Activate(CLSCTX_ALL, None)?;
            let name = dev
                .OpenPropertyStore(STGM_READ)
                .and_then(|s| s.GetValue(&PKEY_Device_FriendlyName))
                .map(|v| v.to_string())
                .unwrap_or_default();
            Ok(Endpoint {
                name,
                volume: (vol.GetMasterVolumeLevelScalar()? as f64 * 100.0).round(),
                muted: vol.GetMute()?.as_bool(),
            })
        }
    }

    fn process_name(pid: u32) -> String {
        if pid == 0 {
            return "Sons système".into();
        }
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return format!("Processus {pid}") };
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            if !ok {
                return format!("Processus {pid}");
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            let stem = path.rsplit(['\\', '/']).next().unwrap_or(&path).trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
            pretty(&stem)
        }
    }

    fn pretty(stem: &str) -> String {
        let known = [("msedge", "Edge"), ("chrome", "Chrome"), ("firefox", "Firefox"), ("spotify", "Spotify"), ("discord", "Discord"), ("teams", "Teams"), ("ms-teams", "Teams"), ("vlc", "VLC"), ("plex", "Plex"), ("steam", "Steam")];
        let low = stem.to_lowercase();
        known.iter().find(|(k, _)| low.contains(k)).map(|(_, v)| v.to_string()).unwrap_or_else(|| {
            let mut c = stem.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
    }

    /// Sessions audio actives (une par appli), avec leur volume.
    fn sessions() -> WinResult<Vec<(u32, ISimpleAudioVolume)>> {
        unsafe {
            let dev = device(eRender)?;
            let mgr: IAudioSessionManager2 = dev.Activate(CLSCTX_ALL, None)?;
            let list = mgr.GetSessionEnumerator()?;
            let mut out = Vec::new();
            for i in 0..list.GetCount()? {
                let Ok(ctrl) = list.GetSession(i) else { continue };
                if ctrl.GetState().map(|s| s == AudioSessionStateExpired).unwrap_or(true) {
                    continue;
                }
                let Ok(ctrl2) = ctrl.cast::<IAudioSessionControl2>() else { continue };
                let pid = ctrl2.GetProcessId().unwrap_or(0);
                if let Ok(vol) = ctrl.cast::<ISimpleAudioVolume>() {
                    out.push((pid, vol));
                }
            }
            Ok(out)
        }
    }

    pub fn state() -> Result<AudioState, String> {
        com();
        let mut apps: Vec<AppVolume> = Vec::new();
        for (pid, vol) in sessions().unwrap_or_default() {
            if apps.iter().any(|a| a.pid == pid) {
                continue;
            }
            unsafe {
                apps.push(AppVolume {
                    pid,
                    name: process_name(pid),
                    volume: (vol.GetMasterVolume().unwrap_or(0.0) as f64 * 100.0).round(),
                    muted: vol.GetMute().map(|m| m.as_bool()).unwrap_or(false),
                });
            }
        }
        apps.sort_by(|a, b| (a.pid == 0).cmp(&(b.pid == 0)).then(a.name.cmp(&b.name)));
        Ok(AudioState { output: endpoint(eRender).ok(), input: endpoint(eCapture).ok(), apps })
    }

    pub fn set(target: &str, volume: Option<f64>, muted: Option<bool>) -> Result<(), String> {
        com();
        let level = volume.map(|v| (v.clamp(0.0, 100.0) / 100.0) as f32);
        let ctx = GUID::zeroed();
        unsafe {
            if let Some(pid) = target.strip_prefix("app:") {
                let pid: u32 = pid.parse().map_err(|_| "appli inconnue")?;
                // Une appli peut avoir plusieurs sessions : on les règle toutes.
                for (p, vol) in sessions().map_err(|e| e.to_string())? {
                    if p == pid {
                        if let Some(l) = level {
                            vol.SetMasterVolume(l, &ctx).map_err(|e| e.to_string())?;
                        }
                        if let Some(m) = muted {
                            vol.SetMute(m, &ctx).map_err(|e| e.to_string())?;
                        }
                    }
                }
                return Ok(());
            }
            let flow = match target {
                "output" => eRender,
                "input" => eCapture,
                _ => return Err("cible inconnue".into()),
            };
            let vol: IAudioEndpointVolume = device(flow).and_then(|d| d.Activate(CLSCTX_ALL, None)).map_err(|e| e.to_string())?;
            if let Some(l) = level {
                vol.SetMasterVolumeLevelScalar(l, &ctx).map_err(|e| e.to_string())?;
            }
            if let Some(m) = muted {
                vol.SetMute(m, &ctx).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}
