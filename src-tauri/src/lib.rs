mod actions;
mod apps;
mod audio;
mod calendar;
mod clipboard;
mod config;
mod discord;
mod display;
mod foreground;
mod ghub;
mod gpu;
mod homeassistant;
mod icue;
mod keys;
mod media;
mod network;
mod secret;
mod studio;
mod system;
mod taskbar;
mod user_widgets;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Relancer l'appli alors qu'elle tourne déjà ouvre simplement le Studio.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = studio::open(app);
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(system::SystemState::default())
        // Fichiers des widgets perso : edgewidget://localhost/<id>/… (http://edgewidget.localhost/… sous Windows).
        .register_uri_scheme_protocol("edgewidget", |ctx, request| user_widgets::serve(ctx.app_handle(), request.uri().path()))
        .invoke_handler(tauri::generate_handler![
            system::system_stats,
            system::sensors,
            gpu::gpu_stats,
            audio::audio_state,
            apps::installed_apps,
            apps::app_icon,
            apps::sharex_path,
            ghub::ghub_batteries,
            icue::icue_batteries,
            foreground::foreground_app,
            network::network_stats,
            network::ping,
            clipboard::clipboard_history,
            clipboard::clipboard_clear,
            clipboard::clipboard_use,
            discord::discord_status,
            discord::discord_setup,
            discord::discord_authorize,
            discord::discord_set,
            discord::discord_forget,
            discord::discord_open,
            discord::discord_clear,
            audio::audio_set,
            media::media_info,
            media::media_control,
            actions::run_action,
            config::load_config,
            config::save_config,
            display::list_monitors,
            display::move_to_monitor,
            user_widgets::user_widgets,
            user_widgets::create_user_widget,
            studio::open_studio,
            config::autostart_get,
            config::autostart_set,
            taskbar::taskbar_set,
            calendar::calendar_status,
            calendar::calendar_connect,
            calendar::calendar_disconnect,
            calendar::calendar_events,
            calendar::teams_presence,
            calendar::teams_set_presence,
            homeassistant::ha_save,
            homeassistant::ha_has_token,
            homeassistant::ha_states,
            homeassistant::ha_service,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("fenêtre principale absente");
            let first_run = config::read(app.handle()).is_none();
            // Version installée : lancement automatique avec Windows dès le premier démarrage.
            if first_run && !cfg!(debug_assertions) {
                use tauri_plugin_autostart::ManagerExt;
                if let Err(e) = app.autolaunch().enable() {
                    eprintln!("[autostart] {e}");
                }
            }
            let hide_taskbar = config::read(app.handle())
                .and_then(|c| c.pointer("/display/hideTaskbar").and_then(|v| v.as_bool()))
                .unwrap_or(true);
            taskbar::set_enabled(hide_taskbar);
            taskbar::start();
            foreground::start();
            clipboard::start();
            discord::start(app.handle().clone());
            let preferred = config::read(app.handle())
                .and_then(|c| c.pointer("/display/monitor").and_then(|m| m.as_str()).map(str::to_owned));
            if let Err(e) = display::place_on_edge(&window, preferred.as_deref()) {
                eprintln!("[display] {e}");
            }
            if let Err(e) = user_widgets::seed(app.handle()) {
                eprintln!("[widgets] {e}");
            }
            if let Err(e) = studio::tray(app.handle()) {
                eprintln!("[tray] {e}");
            }
            window.show()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erreur au lancement d'Edge Studio")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                taskbar::restore();
            }
        });
}
