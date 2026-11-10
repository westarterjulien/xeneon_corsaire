//! GPU sans logiciel externe :
//! - NVIDIA : NVML (bibliothèque installée avec le pilote) → charge, température, mémoire vidéo, nom ;
//! - toute carte (AMD, Intel…) : compteurs de performance Windows « GPU Engine » (ceux du Gestionnaire des tâches) → charge.

use serde::Serialize;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuStats {
    name: String,
    /// Charge 3D en %.
    load: Option<f64>,
    /// °C (NVIDIA uniquement).
    temp: Option<f64>,
    vram_used: Option<u64>,
    vram_total: Option<u64>,
    /// "nvml" ou "pdh".
    source: String,
}

#[tauri::command]
pub async fn gpu_stats() -> Option<GpuStats> {
    tauri::async_runtime::spawn_blocking(read).await.ok().flatten()
}

#[cfg(not(windows))]
fn read() -> Option<GpuStats> {
    None
}

#[cfg(windows)]
fn read() -> Option<GpuStats> {
    nvidia().or_else(pdh)
}

#[cfg(windows)]
fn nvidia() -> Option<GpuStats> {
    use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, Nvml};
    use std::sync::OnceLock;
    // Initialisé une seule fois ; None si pas de carte/pilote NVIDIA.
    static NVML: OnceLock<Option<Nvml>> = OnceLock::new();
    let nvml = NVML.get_or_init(|| Nvml::init().ok()).as_ref()?;
    let d = nvml.device_by_index(0).ok()?;
    let mem = d.memory_info().ok();
    Some(GpuStats {
        name: d.name().unwrap_or_default(),
        load: d.utilization_rates().ok().map(|u| u.gpu as f64),
        temp: d.temperature(TemperatureSensor::Gpu).ok().map(|t| t as f64),
        vram_used: mem.as_ref().map(|m| m.used),
        vram_total: mem.as_ref().map(|m| m.total),
        source: "nvml".into(),
    })
}

#[cfg(windows)]
fn pdh() -> Option<GpuStats> {
    use std::sync::Mutex;
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
    };

    /// Poignées PDH (requête, compteur), utilisées uniquement sous le verrou.
    struct Query(isize, isize);
    static QUERY: Mutex<Option<Query>> = Mutex::new(None);

    let mut guard = QUERY.lock().ok()?;
    if guard.is_none() {
        unsafe {
            let mut q = 0isize;
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut q) != 0 {
                return None;
            }
            let mut c = 0isize;
            if PdhAddEnglishCounterW(q, w!("\\GPU Engine(*engtype_3D)\\Utilization Percentage"), 0, &mut c) != 0 {
                return None;
            }
            PdhCollectQueryData(q);
            *guard = Some(Query(q, c));
        }
        // Un pourcentage se calcule entre deux mesures : la première lecture arrive au prochain appel.
        return Some(GpuStats { name: "GPU".into(), source: "pdh".into(), ..Default::default() });
    }
    let Query(q, c) = guard.as_ref()?;
    unsafe {
        if PdhCollectQueryData(*q) != 0 {
            return None;
        }
        let (mut size, mut count) = (0u32, 0u32);
        if PdhGetFormattedCounterArrayW(*c, PDH_FMT_DOUBLE, &mut size, &mut count, None) != PDH_MORE_DATA {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if PdhGetFormattedCounterArrayW(*c, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items)) != 0 {
            return None;
        }
        // Somme des moteurs 3D de tous les processus (comme le Gestionnaire des tâches), plafonnée à 100 %.
        let total: f64 = std::slice::from_raw_parts(items, count as usize)
            .iter()
            .filter(|i| i.FmtValue.CStatus == 0)
            .map(|i| i.FmtValue.Anonymous.doubleValue)
            .sum();
        Some(GpuStats { name: "GPU".into(), load: Some(total.clamp(0.0, 100.0)), source: "pdh".into(), ..Default::default() })
    }
}
