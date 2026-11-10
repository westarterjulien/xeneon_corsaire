//! Lecture en cours via les contrôles média de Windows (SMTC) :
//! Spotify, navigateurs, lecteur Windows, VLC… tout ce qui s'affiche dans le panneau média de Windows.

use serde::Serialize;

#[derive(Serialize)]
pub struct MediaInfo {
    title: String,
    artist: String,
    album: String,
    playing: bool,
    position: f64,
    duration: f64,
    thumbnail: Option<String>,
    source: String,
}

/// Les commandes de volume passent toujours par les touches multimédia virtuelles.
fn key_for(command: &str) -> Option<&'static str> {
    Some(match command {
        "play_pause" => "media_play_pause",
        "next" => "media_next",
        "previous" => "media_previous",
        "volume_up" => "volume_up",
        "volume_down" => "volume_down",
        "mute" => "volume_mute",
        _ => return None,
    })
}

pub fn control(command: &str) -> Result<(), String> {
    #[cfg(windows)]
    if matches!(command, "play_pause" | "next" | "previous") && win::control(command).unwrap_or(false) {
        return Ok(());
    }
    let key = key_for(command).ok_or_else(|| format!("commande média inconnue : {command}"))?;
    crate::keys::send_combo(key)
}

#[tauri::command]
pub async fn media_info() -> Result<Option<MediaInfo>, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| win::current().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub async fn media_control(command: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || control(&command)).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod win {
    use super::MediaInfo;
    use base64::Engine;
    use std::sync::Mutex;
    use windows::{
        core::Result,
        Media::Control::{
            GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        },
        Storage::Streams::DataReader,
    };

    /// Mémorise la dernière pochette pour ne pas la relire chaque seconde.
    static THUMB_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

    fn session() -> Result<Option<Session>> {
        let manager = Manager::RequestAsync()?.get()?;
        Ok(manager.GetCurrentSession().ok())
    }

    fn thumbnail(session: &Session, key: &str) -> Option<String> {
        if let Some((k, v)) = THUMB_CACHE.lock().ok()?.as_ref() {
            if k == key {
                return v.clone();
            }
        }
        let read = || -> Result<Option<String>> {
            let props = session.TryGetMediaPropertiesAsync()?.get()?;
            let Ok(reference) = props.Thumbnail() else { return Ok(None) };
            let stream = reference.OpenReadAsync()?.get()?;
            let size = stream.Size()? as u32;
            if size == 0 || size > 8 * 1024 * 1024 {
                return Ok(None);
            }
            let content_type = stream.ContentType().map(|s| s.to_string()).unwrap_or_else(|_| "image/png".into());
            let reader = DataReader::CreateDataReader(&stream)?;
            reader.LoadAsync(size)?.get()?;
            let mut buf = vec![0u8; size as usize];
            reader.ReadBytes(&mut buf)?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
            Ok(Some(format!("data:{};base64,{b64}", if content_type.is_empty() { "image/png" } else { &content_type })))
        };
        let v = read().ok().flatten();
        if let Ok(mut cache) = THUMB_CACHE.lock() {
            *cache = Some((key.to_string(), v.clone()));
        }
        v
    }

    pub fn current() -> Result<Option<MediaInfo>> {
        let Some(session) = session()? else { return Ok(None) };
        let props = session.TryGetMediaPropertiesAsync()?.get()?;
        let title = props.Title()?.to_string();
        let artist = props.Artist()?.to_string();
        let album = props.AlbumTitle()?.to_string();
        let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;
        let timeline = session.GetTimelineProperties()?;
        // TimeSpan = unités de 100 ns.
        let position = timeline.Position()?.Duration as f64 / 1e7;
        let duration = (timeline.EndTime()?.Duration - timeline.StartTime()?.Duration) as f64 / 1e7;
        let source = session.SourceAppUserModelId()?.to_string();
        let thumb = thumbnail(&session, &format!("{source}|{title}|{artist}|{album}"));
        Ok(Some(MediaInfo { title, artist, album, playing, position, duration: duration.max(0.0), thumbnail: thumb, source }))
    }

    /// Renvoie Ok(true) si la session a accepté la commande.
    pub fn control(command: &str) -> Result<bool> {
        let Some(session) = session()? else { return Ok(false) };
        let op = match command {
            "play_pause" => session.TryTogglePlayPauseAsync()?,
            "next" => session.TrySkipNextAsync()?,
            "previous" => session.TrySkipPreviousAsync()?,
            _ => return Ok(false),
        };
        op.get()
    }
}
