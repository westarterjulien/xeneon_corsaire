use serde::Deserialize;
use std::process::Command;

/// Actions déclenchées par les widgets (raccourcis, boutons…).
/// Les actions « page » sont gérées côté interface et n'arrivent jamais ici.
#[derive(Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    /// URL, fichier, dossier, appli ou protocole (steam://, discord://…).
    Open { target: String },
    /// Ligne de commande exécutée sans fenêtre de console.
    Command { command: String },
    /// Combinaison de touches, ex. "ctrl+shift+m".
    Keys { keys: String },
    Media { command: String },
}

#[cfg(windows)]
fn hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(windows))]
fn hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

fn open(target: &str) -> Result<(), String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        // Le premier argument vide de `start` est le titre de la fenêtre.
        c.args(["/C", "start", "", target]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(target);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    hidden(&mut cmd).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn shell(command: &str) -> Result<(), String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", command]);
        c
    };
    hidden(&mut cmd).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_action(action: Action) -> Result<(), String> {
    match action {
        Action::Open { target } => open(&target),
        Action::Command { command } => shell(&command),
        Action::Keys { keys } => crate::keys::send_combo(&keys),
        Action::Media { command } => crate::media::control(&command),
    }
}
