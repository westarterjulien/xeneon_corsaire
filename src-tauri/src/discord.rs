//! Discord via son interface locale (RPC, tube nommé \\.\pipe\discord-ipc-N), comme l'Elgato Stream Deck :
//! état réel du micro et de la sourdine dans Discord, et changement direct sans raccourci clavier.
//!
//! Discord réserve cette interface aux applications déclarées : l'utilisateur crée la sienne
//! (discord.com/developers) et en est propriétaire, ce qui suffit. Identifiants et jetons sont chiffrés (DPAPI).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    sync::{mpsc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

const SCOPES: [&str; 5] = ["rpc", "rpc.voice.read", "rpc.voice.write", "rpc.notifications.read", "messages.read"];
/// Permissions nécessaires pour la liste des conversations (absentes d'une ancienne autorisation).
const CONV_SCOPES: [&str; 2] = ["rpc.notifications.read", "messages.read"];
const MAX_CONVS: usize = 12;

/// Conversation (message privé ou salon), triée par activité. Conservée chiffrée sur le disque.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Notif {
    id: u64,
    channel_id: String,
    title: String,
    body: String,
    icon: Option<String>,
    /// ms depuis 1970.
    at: u64,
    unread: bool,
}
const REDIRECT: &str = "http://127.0.0.1";

#[derive(Serialize, Deserialize, Clone, Default)]
struct Creds {
    client_id: String,
    client_secret: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscordStatus {
    /// Identifiants enregistrés.
    configured: bool,
    /// Discord est lancé et répond.
    running: bool,
    /// Autorisation accordée : l'état ci-dessous est fiable.
    authorized: bool,
    /// Autorisation demandée : Discord affiche sa fenêtre de confirmation.
    waiting: bool,
    mute: bool,
    deaf: bool,
    user: Option<String>,
    error: Option<String>,
    /// Autorisation à renouveler pour la nouvelle permission « notifications ».
    needs_upgrade: bool,
    /// Conversations, de la plus récemment active à la plus ancienne.
    messages: Vec<Notif>,
    /// Identifiant Discord du compte connecté (pour reconnaître tes propres messages).
    #[serde(skip)]
    me: Option<String>,
}

// ---------- Conversations conservées (chiffrées) ----------
static CONV_PATH: OnceLock<PathBuf> = OnceLock::new();
static SUBSCRIBED: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|t| t.as_millis() as u64).unwrap_or(0)
}

fn save_convs() {
    let (Some(p), Some(list)) = (CONV_PATH.get(), STATUS.lock().ok().and_then(|g| g.as_ref().map(|s| s.messages.clone()))) else { return };
    if let Ok(bytes) = serde_json::to_vec(&list) {
        if let Ok(enc) = crate::secret::protect(&bytes) {
            let _ = fs::write(p, enc);
        }
    }
}

fn load_convs() -> Vec<Notif> {
    CONV_PATH
        .get()
        .and_then(|p| fs::read(p).ok())
        .and_then(|raw| crate::secret::unprotect(&raw).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// Met à jour (ou crée) une conversation et la remonte en tête.
pub fn upsert(channel_id: &str, title: Option<String>, icon: Option<String>, preview: Option<String>, unread: bool, create: bool) -> bool {
    let mut changed = false;
    status(|st| {
        let pos = st.messages.iter().position(|m| m.channel_id == channel_id);
        if pos.is_none() && !create {
            return;
        }
        let mut c = pos.map(|i| st.messages.remove(i)).unwrap_or_else(|| Notif {
            id: st.messages.iter().map(|m| m.id).max().unwrap_or(0) + 1,
            channel_id: channel_id.to_string(),
            ..Default::default()
        });
        if let Some(t) = title.filter(|t| !t.is_empty()) {
            c.title = t;
        }
        if icon.is_some() {
            c.icon = icon;
        }
        if let Some(p) = preview {
            c.body = p.chars().take(300).collect();
        }
        c.at = now_ms();
        c.unread = unread;
        st.messages.insert(0, c);
        st.messages.truncate(MAX_CONVS);
        changed = true;
    });
    if changed {
        save_convs();
    }
    changed
}

enum Cmd {
    Reload,
    Authorize,
    Set { mute: Option<bool>, deaf: Option<bool> },
    Open { channel_id: String },
}

static STATUS: Mutex<Option<DiscordStatus>> = Mutex::new(None);
static TX: OnceLock<Mutex<mpsc::Sender<Cmd>>> = OnceLock::new();

fn status<F: FnOnce(&mut DiscordStatus)>(f: F) {
    if let Ok(mut g) = STATUS.lock() {
        f(g.get_or_insert_with(DiscordStatus::default));
    }
}

fn send_cmd(c: Cmd) -> Result<(), String> {
    TX.get().ok_or("Discord non initialisé")?.lock().map_err(|e| e.to_string())?.send(c).map_err(|e| e.to_string())
}

fn store(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("discord.cred"))
}

fn load(app: &AppHandle) -> Option<Creds> {
    let raw = fs::read(store(app).ok()?).ok()?;
    serde_json::from_slice(&crate::secret::unprotect(&raw).ok()?).ok()
}

fn save(app: &AppHandle, c: &Creds) -> Result<(), String> {
    let p = store(app)?;
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    fs::write(p, crate::secret::protect(&serde_json::to_vec(c).map_err(|e| e.to_string())?)?).map_err(|e| e.to_string())
}

pub fn valid_id(id: &str) -> bool {
    (15..=25).contains(&id.len()) && id.chars().all(|c| c.is_ascii_digit())
}

pub fn valid_secret(s: &str) -> bool {
    (16..=100).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Échange un code (ou un jeton de rafraîchissement) contre des jetons d'accès.
fn token(creds: &Creds, form: &[(&str, &str)]) -> Result<(String, Option<String>), String> {
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    let agent = ureq::AgentBuilder::new().tls_connector(std::sync::Arc::new(tls)).timeout(Duration::from_secs(15)).build();
    let mut all = vec![("client_id", creds.client_id.as_str()), ("client_secret", creds.client_secret.as_str())];
    all.extend_from_slice(form);
    let v: Value = match agent.post("https://discord.com/api/oauth2/token").send_form(&all) {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(_, r)) => {
            let v: Value = r.into_json().unwrap_or_default();
            return Err(format!("Discord refuse : {}", v.get("error_description").or(v.get("error")).and_then(Value::as_str).unwrap_or("erreur")));
        }
        Err(e) => return Err(format!("connexion à Discord impossible : {e}")),
    };
    let access = v.get("access_token").and_then(Value::as_str).ok_or("réponse inattendue de Discord")?.to_string();
    Ok((access, v.get("refresh_token").and_then(Value::as_str).map(str::to_owned)))
}

// ---------- Commandes ----------
#[tauri::command]
pub fn discord_status() -> DiscordStatus {
    STATUS.lock().ok().and_then(|g| g.clone()).unwrap_or_default()
}

/// Enregistre les identifiants de l'application Discord puis demande l'autorisation.
#[tauri::command]
pub fn discord_setup(app: AppHandle, client_id: String, client_secret: String) -> Result<(), String> {
    let (id, secret) = (client_id.trim().to_string(), client_secret.trim().to_string());
    if !valid_id(&id) {
        return Err("Application ID invalide (une suite de chiffres)".into());
    }
    if !valid_secret(&secret) {
        return Err("Client Secret invalide".into());
    }
    save(&app, &Creds { client_id: id, client_secret: secret, access_token: None, refresh_token: None })?;
    send_cmd(Cmd::Reload)?;
    send_cmd(Cmd::Authorize)
}

#[tauri::command]
pub fn discord_authorize() -> Result<(), String> {
    send_cmd(Cmd::Authorize)
}

#[tauri::command]
pub fn discord_set(mute: Option<bool>, deaf: Option<bool>) -> Result<(), String> {
    send_cmd(Cmd::Set { mute, deaf })
}

/// Ouvre la conversation dans Discord et marque le message comme lu.
#[tauri::command]
pub fn discord_open(channel_id: String) -> Result<(), String> {
    if !valid_id(&channel_id) {
        return Err("conversation invalide".into());
    }
    status(|s| s.messages.iter_mut().filter(|m| m.channel_id == channel_id).for_each(|m| m.unread = false));
    save_convs();
    send_cmd(Cmd::Open { channel_id })
}

/// Efface les messages affichés.
#[tauri::command]
pub fn discord_clear() {
    status(|s| s.messages.clear());
    save_convs();
}

#[tauri::command]
pub fn discord_forget(app: AppHandle) -> Result<(), String> {
    let p = store(&app)?;
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    send_cmd(Cmd::Reload)
}

pub fn start(app: AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = CONV_PATH.set(dir.join("discord.convs"));
    }
    let convs = load_convs();
    status(|s| s.messages = convs);
    let (tx, rx) = mpsc::channel();
    let _ = TX.set(Mutex::new(tx));
    std::thread::spawn(move || imp::worker(app, rx));
}

// ---------- Protocole ----------
#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn worker(_: AppHandle, _: mpsc::Receiver<Cmd>) {
        status(|s| s.error = Some("disponible uniquement sous Windows".into()));
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Pipes::PeekNamedPipe;

    struct Pipe {
        f: File,
        nonce: u64,
    }

    impl Pipe {
        /// Essaie les 10 canaux discord-ipc-N et garde le premier où Discord répond à la poignée de main
        /// (un autre logiciel peut occuper un canal sans répondre). Err(None) = aucun canal ouvert.
        fn connect(client_id: &str) -> Result<Pipe, Option<String>> {
            let mut errors = Vec::new();
            for i in 0..10 {
                let Ok(f) = OpenOptions::new().read(true).write(true).open(format!(r"\\?\pipe\discord-ipc-{i}")) else { continue };
                let mut p = Pipe { f, nonce: 0 };
                match p.handshake(client_id) {
                    Ok(()) => return Ok(p),
                    Err(e) => errors.push(format!("canal {i} : {e}")),
                }
            }
            if errors.is_empty() {
                Err(None)
            } else {
                Err(Some(format!("Discord ne répond pas ({})", errors.join(" ; "))))
            }
        }

        /// Poignée de main : Discord répond par l'évènement READY (ou ferme la connexion si l'ID est refusé).
        fn handshake(&mut self, client_id: &str) -> Result<(), String> {
            self.write(0, &json!({ "v": 1, "client_id": client_id }))?;
            let deadline = Instant::now() + Duration::from_secs(4);
            loop {
                match self.try_read()? {
                    Some((2, v)) => return Err(format!("application refusée : {}", v.get("message").and_then(Value::as_str).unwrap_or("vérifie l'Application ID"))),
                    Some((_, v)) if v.get("evt").and_then(Value::as_str) == Some("READY") => return Ok(()),
                    Some((op, v)) if v.get("evt").and_then(Value::as_str) == Some("ERROR") => {
                        return Err(format!("erreur {op} : {}", v.pointer("/data/message").and_then(Value::as_str).unwrap_or("inconnue")))
                    }
                    Some(_) => {}
                    None if Instant::now() > deadline => return Err("pas de réponse".into()),
                    None => std::thread::sleep(Duration::from_millis(30)),
                }
            }
        }

        fn write(&mut self, op: u32, payload: &Value) -> Result<(), String> {
            let body = payload.to_string().into_bytes();
            let mut buf = Vec::with_capacity(8 + body.len());
            buf.extend_from_slice(&op.to_le_bytes());
            buf.extend_from_slice(&(body.len() as u32).to_le_bytes());
            buf.extend_from_slice(&body);
            self.f.write_all(&buf).map_err(|_| "Discord a été fermé".to_string())
        }

        fn available(&self) -> Result<u32, String> {
            let mut n = 0u32;
            unsafe { PeekNamedPipe(HANDLE(self.f.as_raw_handle()), None, 0, None, Some(&mut n), None) }.map_err(|_| "Discord a été fermé".to_string())?;
            Ok(n)
        }

        /// Lit une trame si des données attendent, sans bloquer sinon.
        fn try_read(&mut self) -> Result<Option<(u32, Value)>, String> {
            if self.available()? < 8 {
                return Ok(None);
            }
            let mut head = [0u8; 8];
            self.f.read_exact(&mut head).map_err(|_| "Discord a été fermé".to_string())?;
            let op = u32::from_le_bytes([head[0], head[1], head[2], head[3]]);
            let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
            if len > 1 << 20 {
                return Err("trame Discord invalide".into());
            }
            let mut body = vec![0u8; len];
            self.f.read_exact(&mut body).map_err(|_| "Discord a été fermé".to_string())?;
            Ok(Some((op, serde_json::from_slice(&body).unwrap_or(Value::Null))))
        }

        /// Envoie une commande et attend sa réponse (les évènements reçus entre-temps mettent l'état à jour).
        fn request(&mut self, cmd: &str, args: Value, evt: Option<&str>, timeout: Duration) -> Result<Value, String> {
            self.nonce += 1;
            let nonce = self.nonce.to_string();
            let mut msg = json!({ "cmd": cmd, "args": args, "nonce": nonce });
            if let Some(e) = evt {
                msg["evt"] = json!(e);
            }
            self.write(1, &msg)?;
            let deadline = Instant::now() + timeout;
            while Instant::now() < deadline {
                match self.try_read()? {
                    Some((2, _)) => return Err("Discord a fermé la connexion".into()),
                    Some((_, v)) => {
                        if v.get("nonce").and_then(Value::as_str) == Some(nonce.as_str()) {
                            if v.get("evt").and_then(Value::as_str) == Some("ERROR") {
                                return Err(v.pointer("/data/message").and_then(Value::as_str).unwrap_or("erreur Discord").to_string());
                            }
                            return Ok(v.get("data").cloned().unwrap_or(Value::Null));
                        }
                        handle_event(&v);
                    }
                    None => std::thread::sleep(Duration::from_millis(30)),
                }
            }
            Err(format!("Discord ne répond pas ({cmd})"))
        }
    }

    fn apply_voice(d: &Value) {
        let (m, de) = (d.get("mute").and_then(Value::as_bool), d.get("deaf").and_then(Value::as_bool));
        status(|s| {
            if let Some(m) = m {
                s.mute = m;
            }
            if let Some(de) = de {
                s.deaf = de;
            }
        });
    }

    fn handle_event(v: &Value) {
        let Some(d) = v.get("data") else { return };
        match v.get("evt").and_then(Value::as_str) {
            Some("VOICE_SETTINGS_UPDATE") => apply_voice(d),
            Some("NOTIFICATION_CREATE") => push_notif(d),
            Some("MESSAGE_CREATE") => on_message(d),
            _ => {}
        }
    }

    fn push_notif(d: &Value) {
        let s = |k: &str| d.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
        let channel_id = s("channel_id");
        if channel_id.is_empty() {
            return;
        }
        let icon = d.get("icon_url").and_then(Value::as_str).filter(|u| u.starts_with("https://")).map(str::to_owned);
        // Une ligne par conversation : elle remonte en tête et passe en « non lu ».
        upsert(&channel_id, Some(s("title")), icon, Some(s("body")), true, true);
    }

    /// Message dans une conversation suivie (de toi ou de l'autre personne).
    fn on_message(d: &Value) {
        let Some(channel_id) = d.get("channel_id").and_then(Value::as_str) else { return };
        let author = d.pointer("/message/author/id").and_then(Value::as_str).unwrap_or_default();
        let name = d.pointer("/message/author/username").and_then(Value::as_str).unwrap_or_default();
        let content = d.pointer("/message/content").and_then(Value::as_str).unwrap_or_default();
        let me = STATUS.lock().ok().and_then(|g| g.as_ref().and_then(|s| s.me.clone()));
        let mine = me.as_deref() == Some(author);
        let preview = if content.is_empty() { None } else if mine { Some(format!("Toi : {content}")) } else { Some(format!("{name} : {content}")) };
        // Tu as répondu : la conversation est lue. Sinon : non lue.
        upsert(channel_id, None, None, preview, !mine, false);
    }

    /// Suit les nouvelles conversations (messages dans les deux sens).
    fn follow(pipe: &mut Pipe) {
        let channels: Vec<String> = STATUS.lock().ok().and_then(|g| g.as_ref().map(|s| s.messages.iter().map(|m| m.channel_id.clone()).collect())).unwrap_or_default();
        for c in channels {
            let todo = SUBSCRIBED.lock().map(|mut l| if l.contains(&c) { false } else { l.push(c.clone()); true }).unwrap_or(false);
            if todo {
                let _ = pipe.request("SUBSCRIBE", json!({ "channel_id": c }), Some("MESSAGE_CREATE"), Duration::from_secs(5));
            }
        }
    }

    /// Attend une commande de l'interface pendant `d` ; renvoie Reload si demandé.
    fn idle(rx: &mpsc::Receiver<Cmd>, d: Duration) -> bool {
        matches!(rx.recv_timeout(d), Ok(Cmd::Reload))
    }

    pub fn worker(app: AppHandle, rx: mpsc::Receiver<Cmd>) {
        loop {
            let Some(creds) = load(&app) else {
                status(|s| *s = DiscordStatus::default());
                idle(&rx, Duration::from_secs(3));
                continue;
            };
            status(|s| s.configured = true);
            let mut pipe = match Pipe::connect(&creds.client_id) {
                Ok(p) => p,
                Err(e) => {
                    status(|s| {
                        // Aucun canal : Discord fermé. Canaux muets : on l'explique.
                        s.running = e.is_some();
                        s.authorized = false;
                        s.error = e;
                    });
                    idle(&rx, Duration::from_secs(5));
                    continue;
                }
            };
            status(|s| {
                s.running = true;
                s.error = None;
            });
            if let Err(e) = session(&app, &mut pipe, &rx, creds) {
                status(|s| {
                    s.error = Some(e);
                    s.authorized = false;
                    s.waiting = false;
                });
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    }

    /// Nom du compte et permissions réellement accordées (une ancienne autorisation n'a pas les notifications).
    fn on_auth(d: &Value) {
        let granted: Vec<&str> = d.get("scopes").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        let complete = CONV_SCOPES.iter().all(|s| granted.contains(s));
        status(|s| {
            s.user = d.pointer("/user/username").and_then(Value::as_str).map(str::to_owned);
            s.me = d.pointer("/user/id").and_then(Value::as_str).map(str::to_owned);
            s.needs_upgrade = !complete;
        });
    }

    fn authorize(app: &AppHandle, pipe: &mut Pipe, creds: &mut Creds) -> Result<bool, String> {
        status(|s| {
            s.waiting = true;
            s.error = None;
        });
        // Discord affiche sa fenêtre d'autorisation : on laisse 2 minutes pour accepter.
        let r = pipe.request("AUTHORIZE", json!({ "client_id": creds.client_id, "scopes": SCOPES }), None, Duration::from_secs(120));
        status(|s| s.waiting = false);
        let code = r?.get("code").and_then(Value::as_str).ok_or("autorisation refusée")?.to_string();
        let (a, rt) = token(creds, &[("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", REDIRECT)])?;
        creds.access_token = Some(a);
        creds.refresh_token = rt;
        save(app, creds)?;
        authenticate(app, pipe, creds)
    }

    fn authenticate(app: &AppHandle, pipe: &mut Pipe, creds: &mut Creds) -> Result<bool, String> {
        let Some(access) = creds.access_token.clone() else { return Ok(false) };
        if let Ok(d) = pipe.request("AUTHENTICATE", json!({ "access_token": access }), None, Duration::from_secs(10)) {
            on_auth(&d);
            return Ok(true);
        }
        // Jeton expiré : rafraîchissement, sinon nouvelle autorisation nécessaire.
        let Some(refresh) = creds.refresh_token.clone() else { return Ok(false) };
        match token(creds, &[("grant_type", "refresh_token"), ("refresh_token", &refresh)]) {
            Ok((a, r)) => {
                creds.access_token = Some(a.clone());
                creds.refresh_token = r.or(Some(refresh));
                save(app, creds)?;
                let d = pipe.request("AUTHENTICATE", json!({ "access_token": a }), None, Duration::from_secs(10))?;
                on_auth(&d);
                Ok(true)
            }
            Err(_) => {
                creds.access_token = None;
                creds.refresh_token = None;
                save(app, creds)?;
                Ok(false)
            }
        }
    }

    fn session(app: &AppHandle, pipe: &mut Pipe, rx: &mpsc::Receiver<Cmd>, mut creds: Creds) -> Result<(), String> {
        // Poignée de main déjà faite par Pipe::connect.

        if let Ok(mut l) = SUBSCRIBED.lock() {
            l.clear();
        }
        let mut authed = authenticate(app, pipe, &mut creds)?;
        status(|s| s.authorized = authed);
        if authed {
            subscribe(pipe)?;
        }

        loop {
            // Commandes de l'interface.
            while let Ok(c) = rx.try_recv() {
                match c {
                    Cmd::Reload => return Ok(()),
                    // Première autorisation, ou nouvelle autorisation pour ajouter la permission « notifications ».
                    Cmd::Authorize if !authed || needs_upgrade() => {
                        authed = authorize(app, pipe, &mut creds)?;
                        status(|s| s.authorized = authed);
                        if authed {
                            subscribe(pipe)?;
                        }
                    }
                    Cmd::Authorize => {}
                    Cmd::Open { channel_id } if authed => {
                        // Affiche la conversation dans Discord (salon de serveur ou message privé).
                        let _ = pipe.request("SELECT_TEXT_CHANNEL", json!({ "channel_id": channel_id }), None, Duration::from_secs(5));
                    }
                    Cmd::Open { .. } => {}
                    Cmd::Set { mute, deaf } if authed => {
                        let mut args = json!({});
                        if let Some(m) = mute {
                            args["mute"] = json!(m);
                        }
                        if let Some(d) = deaf {
                            args["deaf"] = json!(d);
                        }
                        let d = pipe.request("SET_VOICE_SETTINGS", args, None, Duration::from_secs(5))?;
                        apply_voice(&d);
                    }
                    Cmd::Set { .. } => {}
                }
            }
            if authed && !needs_upgrade() {
                follow(pipe);
            }
            // Évènements de Discord.
            match pipe.try_read()? {
                Some((2, _)) => return Err("Discord a fermé la connexion".into()),
                Some((_, v)) => handle_event(&v),
                None => std::thread::sleep(Duration::from_millis(60)),
            }
        }
    }

    fn needs_upgrade() -> bool {
        STATUS.lock().ok().and_then(|g| g.as_ref().map(|s| s.needs_upgrade)).unwrap_or(false)
    }

    fn subscribe(pipe: &mut Pipe) -> Result<(), String> {
        let d = pipe.request("GET_VOICE_SETTINGS", json!({}), None, Duration::from_secs(5))?;
        apply_voice(&d);
        pipe.request("SUBSCRIBE", json!({}), Some("VOICE_SETTINGS_UPDATE"), Duration::from_secs(5))?;
        if !needs_upgrade() {
            // Messages reçus (si l'utilisateur a accordé la permission « notifications »).
            if let Err(e) = pipe.request("SUBSCRIBE", json!({}), Some("NOTIFICATION_CREATE"), Duration::from_secs(5)) {
                status(|s| {
                    s.needs_upgrade = true;
                    s.error = Some(format!("messages indisponibles : {e}"));
                });
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_credentials() {
        assert!(valid_id("1234567890123456789"));
        assert!(!valid_id("12a4"));
        assert!(valid_secret("aB3_dE-fGhIjKlMnOpQrStUvWxYz0123"));
        assert!(!valid_secret("court"));
        assert!(!valid_secret("avec espace et plus de seize caractères"));
    }
}
