//! Mise à jour automatique depuis les Releases GitHub (installateur NSIS produit par la CI).
//!
//! Chaque build de la CI porte son numéro (GITHUB_RUN_NUMBER, figé à la compilation) et publie
//! la release `v<version>-build<N>`. On compare les numéros, on télécharge l'installateur,
//! on vérifie son empreinte SHA-256 (fournie par GitHub), puis on le lance en silencieux :
//! l'appli se ferme, l'installateur remplace les fichiers et la relance.

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const REPO: &str = "westarterjulien/xeneon_corsaire";
/// Numéro de build fourni par GitHub Actions ; absent pour une version compilée à la main.
const BUILD: Option<&str> = option_env!("GITHUB_RUN_NUMBER");

pub fn current_build() -> Option<u32> {
    BUILD.and_then(|b| b.trim().parse().ok())
}

/// "v0.1.0-build24" → 24
pub fn parse_build(tag: &str) -> Option<u32> {
    let (_, n) = tag.rsplit_once("build")?;
    n.trim().parse().ok()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// Build installée (None : version de développement, pas de mise à jour).
    current: Option<u32>,
    latest: Option<u32>,
    available: bool,
    notes: String,
    published: Option<String>,
    /// "idle", "checking", "downloading", "installing" ou "error".
    state: &'static str,
    /// Téléchargement, en %.
    progress: Option<u32>,
    error: Option<String>,
    /// Dernière vérification (ms depuis 1970).
    checked_at: Option<u64>,
}

#[derive(Clone)]
struct Release {
    build: u32,
    url: String,
    size: u64,
    sha256: Option<String>,
}

static STATUS: Mutex<UpdateStatus> = Mutex::new(UpdateStatus {
    current: None,
    latest: None,
    available: false,
    notes: String::new(),
    published: None,
    state: "idle",
    progress: None,
    error: None,
    checked_at: None,
});
static RELEASE: Mutex<Option<Release>> = Mutex::new(None);
/// Une seule vérification ou installation à la fois.
static BUSY: AtomicBool = AtomicBool::new(false);

fn status() -> UpdateStatus {
    let mut s = STATUS.lock().map(|s| s.clone()).unwrap_or_else(|e| e.into_inner().clone());
    s.current = current_build();
    s
}

fn update(f: impl FnOnce(&mut UpdateStatus)) {
    if let Ok(mut s) = STATUS.lock() {
        f(&mut s);
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Libère BUSY même en cas d'erreur ou de panique.
struct Busy;
impl Busy {
    fn take() -> Option<Busy> {
        (!BUSY.swap(true, Ordering::SeqCst)).then_some(Busy)
    }
}
impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

fn fetch_latest() -> Result<(Release, String, Option<String>), String> {
    let agent = crate::calendar::agent()?;
    let v: Value = agent
        .get(&format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .set("User-Agent", "EdgeStudio-updater")
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("GitHub a répondu {code}"),
            e => format!("GitHub injoignable : {e}"),
        })?
        .into_json()
        .map_err(|e| e.to_string())?;
    let tag = v["tag_name"].as_str().unwrap_or_default();
    let build = parse_build(tag).ok_or_else(|| format!("version inattendue : {tag}"))?;
    let asset = v["assets"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["name"].as_str().is_some_and(|n| n.to_ascii_lowercase().ends_with("-setup.exe"))))
        .ok_or("installateur absent de la dernière version (build peut-être encore en cours)")?;
    let url = asset["browser_download_url"].as_str().ok_or("lien de téléchargement absent")?.to_string();
    let sha256 = asset["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(|d| d.to_ascii_lowercase());
    let release = Release { build, url, size: asset["size"].as_u64().unwrap_or(0), sha256 };
    let notes = v["body"].as_str().unwrap_or_default().trim().to_string();
    Ok((release, notes, v["published_at"].as_str().map(str::to_owned)))
}

/// Interroge GitHub et met à jour l'état (bloquant).
fn check_blocking() -> UpdateStatus {
    let Some(_busy) = Busy::take() else { return status() };
    update(|s| {
        s.state = "checking";
        s.error = None;
    });
    match fetch_latest() {
        Ok((release, notes, published)) => {
            let available = current_build().is_some_and(|c| release.build > c);
            update(|s| {
                s.latest = Some(release.build);
                s.available = available;
                s.notes = notes;
                s.published = published;
                s.state = "idle";
                s.checked_at = Some(now_ms());
            });
            if let Ok(mut r) = RELEASE.lock() {
                *r = Some(release);
            }
        }
        Err(e) => update(|s| {
            s.state = "error";
            s.error = Some(e);
            s.checked_at = Some(now_ms());
        }),
    }
    status()
}

fn download(r: &Release) -> Result<std::path::PathBuf, String> {
    let agent = crate::calendar::agent()?;
    let resp = agent
        .get(&r.url)
        .set("User-Agent", "EdgeStudio-updater")
        .timeout(Duration::from_secs(600))
        .call()
        .map_err(|e| format!("téléchargement impossible : {e}"))?;
    let total = resp.header("Content-Length").and_then(|v| v.parse::<u64>().ok()).unwrap_or(r.size);
    let path = std::env::temp_dir().join(format!("EdgeStudio-build{}-setup.exe", r.build));
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut reader = resp.into_reader();
    let mut hasher = Sha256::new();
    let (mut buf, mut done) = (vec![0u8; 64 * 1024], 0u64);
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("téléchargement interrompu : {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if total > 0 {
            update(|s| s.progress = Some((done * 100 / total).min(100) as u32));
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let fail = |msg: String| {
        let _ = std::fs::remove_file(&path);
        Err(msg)
    };
    if r.size > 0 && done != r.size {
        return fail(format!("fichier incomplet ({done} octets sur {})", r.size));
    }
    if let Some(expected) = &r.sha256 {
        let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if &got != expected {
            return fail("empreinte SHA-256 différente de celle publiée par GitHub : installation annulée".into());
        }
    }
    Ok(path)
}

/// Chaîne PowerShell entre apostrophes.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Télécharge et lance l'installateur, puis ferme l'appli (bloquant).
fn install_blocking(app: &AppHandle) -> Result<(), String> {
    if current_build().is_none() {
        return Err("version de développement : pas de mise à jour automatique".into());
    }
    let Some(_busy) = Busy::take() else { return Err("une vérification ou une installation est déjà en cours".into()) };
    let release = RELEASE.lock().ok().and_then(|r| r.clone()).ok_or("aucune nouvelle version connue : vérifie d'abord")?;
    if !current_build().is_some_and(|c| release.build > c) {
        return Err("déjà à jour".into());
    }
    update(|s| {
        s.state = "downloading";
        s.progress = Some(0);
        s.error = None;
    });
    let installer = match download(&release) {
        Ok(p) => p,
        Err(e) => {
            update(|s| {
                s.state = "error";
                s.progress = None;
                s.error = Some(e.clone());
            });
            return Err(e);
        }
    };
    update(|s| {
        s.state = "installing";
        s.progress = None;
    });
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // Attendre la fermeture de l'appli, installer en silencieux (installation par utilisateur : pas d'UAC), relancer.
    let script = format!(
        "Start-Sleep -Seconds 2; Start-Process -FilePath {} -ArgumentList '/S' -Wait; Start-Process -FilePath {}",
        ps_quote(&installer.to_string_lossy()),
        ps_quote(&exe.to_string_lossy())
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &script]);
    if let Err(e) = crate::actions::hidden(&mut cmd).spawn() {
        let msg = format!("impossible de lancer l'installateur : {e}");
        update(|s| {
            s.state = "error";
            s.error = Some(msg.clone());
        });
        return Err(msg);
    }
    app.exit(0);
    Ok(())
}

fn auto_enabled(app: &AppHandle) -> bool {
    crate::config::read(app).and_then(|c| c.pointer("/updates/auto").and_then(Value::as_bool)).unwrap_or(true)
}

/// Vérification en tâche de fond : peu après le démarrage puis toutes les 6 h.
/// En mode automatique, l'installation attend qu'aucune appli ne soit en plein écran (jeu, vidéo).
pub fn start(app: AppHandle) {
    if current_build().is_none() {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(90));
        loop {
            let s = check_blocking();
            let mut wait = Duration::from_secs(6 * 3600);
            if s.available && auto_enabled(&app) {
                if crate::foreground::is_fullscreen() {
                    wait = Duration::from_secs(15 * 60); // on réessaie plus tard
                } else if let Err(e) = install_blocking(&app) {
                    eprintln!("[mise à jour] {e}");
                    wait = Duration::from_secs(3600);
                }
            }
            std::thread::sleep(wait);
        }
    });
}

#[tauri::command]
pub fn update_status() -> UpdateStatus {
    status()
}

#[tauri::command]
pub async fn update_check() -> Result<UpdateStatus, String> {
    tauri::async_runtime::spawn_blocking(check_blocking).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install_blocking(&app)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_build_numbers() {
        assert_eq!(parse_build("v0.1.0-build24"), Some(24));
        assert_eq!(parse_build("v1.2.3-build125"), Some(125));
        assert_eq!(parse_build("v0.1.0"), None);
        assert_eq!(parse_build("v0.1.0-buildx"), None);
    }

    #[test]
    fn quotes_for_powershell() {
        assert_eq!(ps_quote(r"C:\Users\O'Neil\a.exe"), r"'C:\Users\O''Neil\a.exe'");
    }
}
