mod actions;
mod config;
mod display;
mod keys;
mod media;
mod studio;
mod system;
mod user_widgets;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(system::SystemState::default())
        // Fichiers des widgets perso : edgewidget://localhost/<id>/… (http://edgewidget.localhost/… sous Windows).
        .register_uri_scheme_protocol("edgewidget", |ctx, request| user_widgets::serve(ctx.app_handle(), request.uri().path()))
        .invoke_handler(tauri::generate_handler![
            system::system_stats,
            system::sensors,
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
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("fenêtre principale absente");
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
        .run(tauri::generate_context!())
        .expect("erreur au lancement d'Edge Studio");
}
