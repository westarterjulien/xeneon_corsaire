//! Simulation de touches clavier (Windows : SendInput).

/// Code de touche virtuelle Windows et indicateur « touche étendue ».
pub fn virtual_key(name: &str) -> Option<(u16, bool)> {
    let n = name.trim().to_ascii_lowercase();
    let k = match n.as_str() {
        "ctrl" | "control" => (0x11, false),
        "shift" => (0x10, false),
        "alt" => (0x12, false),
        "win" | "meta" | "super" => (0x5B, true),
        "enter" | "return" => (0x0D, false),
        "esc" | "escape" => (0x1B, false),
        "tab" => (0x09, false),
        "space" => (0x20, false),
        "backspace" => (0x08, false),
        "delete" | "del" => (0x2E, true),
        "insert" | "ins" => (0x2D, true),
        "home" => (0x24, true),
        "end" => (0x23, true),
        "pageup" => (0x21, true),
        "pagedown" => (0x22, true),
        "left" => (0x25, true),
        "up" => (0x26, true),
        "right" => (0x27, true),
        "down" => (0x28, true),
        "printscreen" | "prtsc" => (0x2C, true),
        "volume_mute" | "mute" => (0xAD, true),
        "volume_down" => (0xAE, true),
        "volume_up" => (0xAF, true),
        "media_next" | "next" => (0xB0, true),
        "media_previous" | "previous" => (0xB1, true),
        "media_stop" | "stop" => (0xB2, true),
        "media_play_pause" | "play_pause" => (0xB3, true),
        _ => {
            let b = n.as_bytes();
            if b.len() == 1 && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit()) {
                (b[0].to_ascii_uppercase() as u16, false)
            } else {
                let f = n.strip_prefix('f')?.parse::<u16>().ok().filter(|f| (1..=24).contains(f))?;
                (0x70 + f - 1, false)
            }
        }
    };
    Some(k)
}

pub fn parse_combo(combo: &str) -> Result<Vec<(u16, bool)>, String> {
    let keys: Result<Vec<_>, _> = combo
        .split('+')
        .filter(|p| !p.trim().is_empty())
        .map(|p| virtual_key(p).ok_or_else(|| format!("touche inconnue : {p}")))
        .collect();
    let keys = keys?;
    if keys.is_empty() {
        return Err("combinaison vide".into());
    }
    Ok(keys)
}

#[cfg(windows)]
pub fn send_combo(combo: &str) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    };
    let keys = parse_combo(combo)?;
    let event = |vk: u16, ext: bool, up: bool| {
        let mut flags = KEYBD_EVENT_FLAGS(0);
        if ext {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if up {
            flags |= KEYEVENTF_KEYUP;
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    };
    // Appui dans l'ordre, relâchement dans l'ordre inverse.
    let mut inputs: Vec<INPUT> = keys.iter().map(|&(vk, ext)| event(vk, ext, false)).collect();
    inputs.extend(keys.iter().rev().map(|&(vk, ext)| event(vk, ext, true)));
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err("SendInput a été bloqué (une appli administrateur a peut-être le focus)".into())
    }
}

#[cfg(not(windows))]
pub fn send_combo(combo: &str) -> Result<(), String> {
    parse_combo(combo)?;
    Err("la simulation de touches n'est disponible que sous Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_combos() {
        assert_eq!(parse_combo("ctrl+shift+m").unwrap(), vec![(0x11, false), (0x10, false), (0x4D, false)]);
        assert_eq!(parse_combo("win + e").unwrap(), vec![(0x5B, true), (0x45, false)]);
        assert_eq!(parse_combo("alt+f4").unwrap(), vec![(0x12, false), (0x73, false)]);
        assert!(parse_combo("ctrl+nope").is_err());
        assert!(parse_combo("").is_err());
    }
}
