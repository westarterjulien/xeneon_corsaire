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
    /// Programme lancé directement avec ses arguments (sans passer par cmd.exe : aucun souci de guillemets).
    Run { program: String, args: Vec<String> },
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

pub fn open_target(target: &str) -> Result<(), String> {
    // Applis du menu Démarrer (y compris Store) : shell:AppsFolder\<AppID>, ouvert par l'Explorateur.
    if cfg!(windows) && target.to_ascii_lowercase().starts_with("shell:") {
        let mut c = Command::new("explorer.exe");
        c.arg(target);
        return hidden(&mut c).spawn().map(|_| ()).map_err(|e| e.to_string());
    }
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
        Action::Open { target } => open_target(&target),
        Action::Command { command } => shell(&command),
        Action::Keys { keys } => {
            // Toucher l'Edge lui a donné le focus : les touches doivent repartir vers l'appli d'avant.
            tauri::async_runtime::spawn_blocking(move || {
                crate::foreground::focus_previous();
                crate::keys::send_combo(&keys)
            })
            .await
            .map_err(|e| e.to_string())?
        }
        Action::Media { command } => crate::media::control(&command),
        Action::Run { program, args } => {
            let program = expand_env(program.trim().trim_matches('"'));
            let name = program.rsplit(['\\', '/']).next().unwrap_or(&program).to_string();
            // Chemin complet introuvable : message clair plutôt qu'une erreur système.
            if (program.contains('\\') || program.contains('/')) && std::fs::symlink_metadata(&program).is_err() {
                return Err(format!("{name} introuvable à cet emplacement : {program}"));
            }
            let mut c = Command::new(&program);
            c.args(&args);
            hidden(&mut c).spawn().map(|_| ()).map_err(|e| format!("impossible de lancer {name} : {e}"))
        }
    }
}

/// Remplace %VARIABLE% par sa valeur (ex. %ProgramFiles%).
pub fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        match after.find('%') {
            Some(j) if j > 0 => {
                let name = &after[..j];
                out.push_str(&std::env::var(name).unwrap_or_else(|_| format!("%{name}%")));
                rest = &after[j + 1..];
            }
            _ => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_env() {
        std::env::set_var("EDGE_TEST_DIR", "C:\\Prog");
        assert_eq!(expand_env("%EDGE_TEST_DIR%\\ShareX\\ShareX.exe"), "C:\\Prog\\ShareX\\ShareX.exe");
        assert_eq!(expand_env("100%"), "100%");
        assert_eq!(expand_env("%NOPE_EDGE%"), "%NOPE_EDGE%");
    }
}
