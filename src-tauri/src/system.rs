use serde::Serialize;
use serde_json::Value;
use std::{sync::Mutex, time::Duration};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use tauri::State;

pub struct SystemState(Mutex<System>);

impl Default for SystemState {
    fn default() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::new().with_cpu_usage())
                .with_memory(MemoryRefreshKind::new().with_ram()),
        );
        Self(Mutex::new(sys))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    cpu: f32,
    cpu_per_core: Vec<f32>,
    mem_used: u64,
    mem_total: u64,
    uptime: u64,
    hostname: String,
}

#[tauri::command]
pub fn system_stats(state: State<'_, SystemState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap_or_else(|e| e.into_inner());
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    SystemStats {
        cpu: sys.global_cpu_usage(),
        cpu_per_core: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        mem_used: sys.used_memory(),
        mem_total: sys.total_memory(),
        uptime: System::uptime(),
        hostname: System::host_name().unwrap_or_default(),
    }
}

#[derive(Serialize)]
pub struct Sensor {
    path: String,
    name: String,
    value: Option<f64>,
    unit: String,
}

/// "45,5 °C" → (Some(45.5), "°C")
fn parse_value(raw: &str) -> (Option<f64>, String) {
    let raw = raw.trim();
    let end = raw
        .char_indices()
        .find(|(_, c)| !(c.is_ascii_digit() || *c == '.' || *c == ',' || *c == '-'))
        .map(|(i, _)| i)
        .unwrap_or(raw.len());
    let num = raw[..end].replace(',', ".").parse::<f64>().ok();
    (num, raw[end..].trim().to_string())
}

fn walk(node: &Value, path: &mut Vec<String>, out: &mut Vec<Sensor>) {
    let text = node.get("Text").and_then(Value::as_str).unwrap_or_default().to_string();
    let children = node.get("Children").and_then(Value::as_array);
    match children {
        Some(list) if !list.is_empty() => {
            path.push(text);
            for c in list {
                walk(c, path, out);
            }
            path.pop();
        }
        _ => {
            let raw = node.get("Value").and_then(Value::as_str).unwrap_or_default();
            if raw.is_empty() {
                return;
            }
            let (value, unit) = parse_value(raw);
            // On saute les deux premiers niveaux (racine "Sensor" et nom du PC).
            let mut full: Vec<&str> = path.iter().skip(2).map(String::as_str).collect();
            full.push(&text);
            out.push(Sensor { path: full.join(" / "), name: text.clone(), value, unit });
        }
    }
}

fn fetch_sensors(url: &str) -> Result<Vec<Sensor>, String> {
    let json: Value = ureq::get(url)
        .timeout(Duration::from_millis(1500))
        .call()
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    walk(&json, &mut Vec::new(), &mut out);
    Ok(out)
}

/// Lit les capteurs exposés par LibreHardwareMonitor (Options → Remote Web Server).
#[tauri::command]
pub async fn sensors(url: String) -> Result<Vec<Sensor>, String> {
    if url.is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || fetch_sensors(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_values() {
        assert_eq!(parse_value("45,5 °C"), (Some(45.5), "°C".into()));
        assert_eq!(parse_value("12 %"), (Some(12.0), "%".into()));
        assert_eq!(parse_value("1200 RPM"), (Some(1200.0), "RPM".into()));
    }

    #[test]
    fn flattens_lhm_tree() {
        let json: Value = serde_json::json!({
            "Text": "Sensor", "Children": [{
                "Text": "PC", "Children": [{
                    "Text": "NVIDIA GeForce RTX 4080", "Children": [{
                        "Text": "Temperatures", "Children": [{ "Text": "GPU Core", "Value": "52,0 °C", "Children": [] }]
                    }]
                }]
            }]
        });
        let mut out = Vec::new();
        walk(&json, &mut Vec::new(), &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "NVIDIA GeForce RTX 4080 / Temperatures / GPU Core");
        assert_eq!(out[0].value, Some(52.0));
    }
}
