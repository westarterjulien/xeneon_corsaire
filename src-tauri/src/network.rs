//! Réseau : débit montant / descendant (toutes interfaces), adresse locale, ping.

use serde::Serialize;
use std::{net::UdpSocket, sync::Mutex, time::Instant};
use sysinfo::Networks;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetStats {
    /// Octets par seconde.
    down: f64,
    up: f64,
    local_ip: Option<String>,
}

static NETS: Mutex<Option<(Networks, Instant)>> = Mutex::new(None);

#[tauri::command]
pub fn network_stats() -> NetStats {
    let mut g = NETS.lock().unwrap_or_else(|e| e.into_inner());
    let (down, up) = match g.as_mut() {
        None => {
            *g = Some((Networks::new_with_refreshed_list(), Instant::now()));
            (0.0, 0.0)
        }
        Some((nets, at)) => {
            nets.refresh();
            let secs = at.elapsed().as_secs_f64().max(0.2);
            *at = Instant::now();
            let (rx, tx) = nets.iter().fold((0u64, 0u64), |(r, t), (_, d)| (r + d.received(), t + d.transmitted()));
            (rx as f64 / secs, tx as f64 / secs)
        }
    };
    NetStats { down, up, local_ip: local_ip() }
}

/// Adresse locale utilisée pour sortir sur Internet (aucun paquet n'est envoyé).
fn local_ip() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

/// Temps d'aller-retour en ms vers `host` (ICMP, sans droits administrateur sous Windows).
#[tauri::command]
pub async fn ping(host: String) -> Result<u32, String> {
    if host.is_empty() || host.len() > 255 || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c)) {
        return Err("adresse invalide".into());
    }
    tauri::async_runtime::spawn_blocking(move || imp::ping(&host)).await.map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
mod imp {
    pub fn ping(_: &str) -> Result<u32, String> {
        Err("disponible uniquement sous Windows".into())
    }
}

#[cfg(windows)]
mod imp {
    use std::net::{IpAddr, ToSocketAddrs};
    use windows::Win32::NetworkManagement::IpHelper::{IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY};

    pub fn ping(host: &str) -> Result<u32, String> {
        let ip = (host, 0)
            .to_socket_addrs()
            .map_err(|_| format!("{host} introuvable"))?
            .find_map(|a| match a.ip() {
                IpAddr::V4(v4) => Some(v4),
                _ => None,
            })
            .ok_or_else(|| format!("{host} : pas d'adresse IPv4"))?;
        unsafe {
            let h = IcmpCreateFile().map_err(|e| e.to_string())?;
            let data = *b"edgestudio";
            let mut reply = vec![0u8; std::mem::size_of::<ICMP_ECHO_REPLY>() + data.len() + 8];
            let n = IcmpSendEcho(h, u32::from_ne_bytes(ip.octets()), data.as_ptr() as *const _, data.len() as u16, None, reply.as_mut_ptr() as *mut _, reply.len() as u32, 1500);
            let _ = IcmpCloseHandle(h);
            if n == 0 {
                return Err("pas de réponse".into());
            }
            let r = &*(reply.as_ptr() as *const ICMP_ECHO_REPLY);
            if r.Status != 0 {
                return Err("pas de réponse".into());
            }
            Ok(r.RoundTripTime)
        }
    }
}
