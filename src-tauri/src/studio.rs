//! Fenêtre « Studio » : configuration à la souris sur l'écran principal, avec aperçu de l'Edge.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder,
};

pub const LABEL: &str = "studio";

pub fn open<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.unminimize()?;
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("studio.html".into()))
        .title("Edge Studio")
        .inner_size(1600.0, 940.0)
        .min_inner_size(1100.0, 680.0)
        // Sinon WebView2 intercepte le glisser-déposer et celui des widgets vers l'aperçu ne marche pas.
        .disable_drag_drop_handler()
        .visible(false)
        .build()?;
    // Centré sur un écran qui n'est pas l'Edge (de préférence l'écran principal).
    let monitors = w.available_monitors().unwrap_or_default();
    let primary = w.primary_monitor().ok().flatten();
    let target = primary
        .filter(|m| !crate::display::is_edge(m))
        .or_else(|| monitors.into_iter().find(|m| !crate::display::is_edge(m)));
    if let Some(m) = target {
        let size = w.outer_size()?;
        let (mw, mh) = (m.size().width as i32, m.size().height as i32);
        let (ww, wh) = ((size.width as i32).min(mw), (size.height as i32).min(mh));
        w.set_position(PhysicalPosition::new(m.position().x + (mw - ww) / 2, m.position().y + (mh - wh) / 2))?;
    }
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Création de fenêtre dans une commande asynchrone (évite un blocage sous Windows).
#[tauri::command]
pub async fn open_studio(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

/// Icône de la zone de notification : clic = Studio, menu = Studio / Quitter.
pub fn tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let studio = MenuItem::with_id(app, "studio", "Ouvrir le Studio", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter Edge Studio", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&studio, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Edge Studio")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "studio" => {
                let _ = open(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = open(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
