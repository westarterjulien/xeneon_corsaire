//! Batteries des périphériques Corsair via le SDK iCUE officiel (v4).
//! La bibliothèque du SDK n'est pas redistribuée : elle est téléchargée chez Corsair (GitHub officiel)
//! à la première utilisation, puis vérifiée par empreinte SHA-256 avant d'être chargée.

use serde::Serialize;
use std::{
    ffi::{c_char, c_int, c_uint, c_void, CStr},
    fs,
    io::Read,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Manager};

const SDK_URL: &str = "https://github.com/CorsairOfficial/cue-sdk/releases/download/v4.0.84/iCUESDK_4.0.84.zip";
const ZIP_SHA256: &str = "eb4414cf505145f3e507dc839ad587bf7ca684d64be3d9a834f416a136736d5d";
const DLL_SHA256: &str = "d72fd819b91fd1d3b0c3db2ea17a47dcfe3b38e26269aa967ecfee10d2e93884";
const DLL_IN_ZIP: &str = "iCUESDK/redist/x64/iCUESDK.x64_2019.dll";
const DLL_NAME: &str = "iCUESDK.x64_2019.dll";

// ---------- Structures du SDK (iCUESDK.h, v4) ----------
const CE_SUCCESS: c_int = 0;
const CE_NOT_CONNECTED: c_int = 1;
const CDT_ALL: c_int = -1; // 0xFFFFFFFF
const CDPI_BATTERY_LEVEL: c_int = 9;
const CT_INT32: c_int = 1;
const DEVICE_COUNT_MAX: usize = 64;

#[repr(C)]
#[derive(Clone, Copy)]
struct DeviceInfo {
    kind: c_int,
    id: [c_char; 128],
    serial: [c_char; 128],
    model: [c_char; 128],
    led_count: c_int,
    channel_count: c_int,
}

#[repr(C)]
struct DeviceFilter {
    device_type_mask: c_int,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ArrayValue {
    items: *mut c_void,
    count: c_uint,
}

#[repr(C)]
union DataValue {
    boolean: bool,
    int32: c_int,
    float64: f64,
    string: *mut c_char,
    array: ArrayValue,
}

#[repr(C)]
struct Property {
    kind: c_int,
    value: DataValue,
}

type StateHandler = extern "C" fn(*mut c_void, *const c_void);
type Connect = unsafe extern "C" fn(StateHandler, *mut c_void) -> c_int;
type GetDevices = unsafe extern "C" fn(*const DeviceFilter, c_int, *mut DeviceInfo, *mut c_int) -> c_int;
type ReadProperty = unsafe extern "C" fn(*const c_char, c_int, c_uint, *mut Property) -> c_int;
type FreeProperty = unsafe extern "C" fn(*mut Property) -> c_int;

struct Sdk {
    get_devices: GetDevices,
    read_property: ReadProperty,
    free_property: FreeProperty,
}

extern "C" fn on_state(_: *mut c_void, _: *const c_void) {}

static SDK: OnceLock<Sdk> = OnceLock::new();
static LOADING: Mutex<()> = Mutex::new(());

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(data).iter().map(|b| format!("{b:02x}")).collect()
}

fn dll_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("icue").join(DLL_NAME))
}

/// Télécharge le SDK officiel si besoin et renvoie le chemin d'une DLL vérifiée.
fn ensure_dll(app: &AppHandle) -> Result<PathBuf, String> {
    let path = dll_path(app)?;
    if fs::read(&path).map(|b| sha256_hex(&b) == DLL_SHA256).unwrap_or(false) {
        return Ok(path);
    }
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    let agent = ureq::AgentBuilder::new().tls_connector(std::sync::Arc::new(tls)).timeout(Duration::from_secs(30)).build();
    let resp = agent.get(SDK_URL).call().map_err(|e| format!("téléchargement du SDK Corsair impossible : {e}"))?;
    let mut zip_bytes = Vec::new();
    resp.into_reader().take(10 * 1024 * 1024).read_to_end(&mut zip_bytes).map_err(|e| e.to_string())?;
    if sha256_hex(&zip_bytes) != ZIP_SHA256 {
        return Err("SDK Corsair téléchargé invalide (empreinte inattendue)".into());
    }
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    let mut dll = Vec::new();
    archive.by_name(DLL_IN_ZIP).map_err(|e| e.to_string())?.read_to_end(&mut dll).map_err(|e| e.to_string())?;
    if sha256_hex(&dll) != DLL_SHA256 {
        return Err("bibliothèque du SDK Corsair invalide (empreinte inattendue)".into());
    }
    if let Some(d) = path.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    fs::write(&path, dll).map_err(|e| e.to_string())?;
    Ok(path)
}

fn sdk(app: &AppHandle) -> Result<&'static Sdk, String> {
    if let Some(s) = SDK.get() {
        return Ok(s);
    }
    let _guard = LOADING.lock().map_err(|e| e.to_string())?;
    if let Some(s) = SDK.get() {
        return Ok(s);
    }
    let path = ensure_dll(app)?;
    // Revérifie juste avant le chargement (le fichier pourrait avoir été remplacé entre-temps).
    if sha256_hex(&fs::read(&path).map_err(|e| e.to_string())?) != DLL_SHA256 {
        return Err("bibliothèque du SDK Corsair modifiée".into());
    }
    unsafe {
        let lib: &'static libloading::Library = Box::leak(Box::new(libloading::Library::new(&path).map_err(|e| format!("chargement du SDK Corsair impossible : {e}"))?));
        let connect: Connect = *lib.get::<Connect>(b"CorsairConnect\0").map_err(|e| e.to_string())?;
        let s = Sdk {
            get_devices: *lib.get::<GetDevices>(b"CorsairGetDevices\0").map_err(|e| e.to_string())?,
            read_property: *lib.get::<ReadProperty>(b"CorsairReadDeviceProperty\0").map_err(|e| e.to_string())?,
            free_property: *lib.get::<FreeProperty>(b"CorsairFreeProperty\0").map_err(|e| e.to_string())?,
        };
        connect(on_state, std::ptr::null_mut());
        let _ = SDK.set(s);
    }
    SDK.get().ok_or_else(|| "SDK Corsair indisponible".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorsairBattery {
    id: String,
    name: String,
    kind: String,
    percentage: Option<f64>,
    charging: bool,
}

fn kind(t: c_int) -> &'static str {
    match t {
        0x0001 => "keyboard",
        0x0002 => "mouse",
        0x0008 => "headset",
        _ => "other",
    }
}

fn read(app: &AppHandle) -> Result<Vec<CorsairBattery>, String> {
    let s = sdk(app)?;
    let filter = DeviceFilter { device_type_mask: CDT_ALL };
    let mut devices = vec![
        DeviceInfo { kind: 0, id: [0; 128], serial: [0; 128], model: [0; 128], led_count: 0, channel_count: 0 };
        DEVICE_COUNT_MAX
    ];
    let mut size: c_int = 0;
    // La connexion à iCUE est asynchrone : on laisse quelques secondes au premier appel.
    let mut err = CE_NOT_CONNECTED;
    for _ in 0..6 {
        err = unsafe { (s.get_devices)(&filter, DEVICE_COUNT_MAX as c_int, devices.as_mut_ptr(), &mut size) };
        if err != CE_NOT_CONNECTED {
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    if err == CE_NOT_CONNECTED {
        return Err("iCUE n'est pas lancé, ou le SDK est désactivé dans ses réglages".into());
    }
    if err != CE_SUCCESS {
        return Err(format!("iCUE a renvoyé l'erreur {err}"));
    }
    let mut out = Vec::new();
    for d in devices.iter().take(size.clamp(0, DEVICE_COUNT_MAX as c_int) as usize) {
        let mut prop = Property { kind: 0, value: DataValue { int32: 0 } };
        let ok = unsafe { (s.read_property)(d.id.as_ptr(), CDPI_BATTERY_LEVEL, 0, &mut prop) } == CE_SUCCESS;
        if !ok {
            continue; // appareil filaire ou sans batterie
        }
        let pct = if prop.kind == CT_INT32 { Some(unsafe { prop.value.int32 } as f64) } else { None };
        unsafe { (s.free_property)(&mut prop) };
        let Some(p) = pct else { continue };
        let cstr = |a: &[c_char; 128]| unsafe { CStr::from_ptr(a.as_ptr()) }.to_string_lossy().into_owned();
        out.push(CorsairBattery { id: cstr(&d.id), name: cstr(&d.model), kind: kind(d.kind).into(), percentage: Some(p), charging: false });
    }
    Ok(out)
}

#[tauri::command]
pub async fn icue_batteries(app: AppHandle) -> Result<Vec<CorsairBattery>, String> {
    if !cfg!(windows) {
        return Err("disponible uniquement sous Windows".into());
    }
    tauri::async_runtime::spawn_blocking(move || read(&app)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_matches_sdk() {
        // CorsairDeviceInfo : 4 + 3 × 128 + 2 × 4 octets ; CorsairProperty : type + union de 16 octets alignée sur 8.
        assert_eq!(std::mem::size_of::<DeviceInfo>(), 4 + 384 + 8);
        assert_eq!(std::mem::size_of::<Property>(), 24);
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
