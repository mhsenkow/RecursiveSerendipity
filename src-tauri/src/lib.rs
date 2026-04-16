use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

const ENGINE_PORT: u16 = 9700;

struct EngineProcess(Mutex<Option<Child>>);

#[tauri::command]
async fn engine_health() -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/health", ENGINE_PORT);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Engine not reachable: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn start_run(seed: String, threshold: Option<f64>, max_iterations: Option<u32>, generator_model: Option<String>, critic_model: Option<String>, num_variants: Option<u32>, num_iterations: Option<u32>) -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/runs", ENGINE_PORT);
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({ "seed": seed });
    if let Some(t) = threshold { body["threshold"] = serde_json::json!(t); }
    if let Some(m) = max_iterations { body["maxIterations"] = serde_json::json!(m); }
    if let Some(g) = generator_model { body["generatorModel"] = serde_json::json!(g); }
    if let Some(c) = critic_model { body["criticModel"] = serde_json::json!(c); }
    if let Some(n) = num_variants { body["numVariants"] = serde_json::json!(n); }
    if let Some(n) = num_iterations { body["numIterations"] = serde_json::json!(n); }
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to start run: {}", e))?;
    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(result)
}

#[tauri::command]
async fn get_run_status(run_id: String) -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/runs/{}", ENGINE_PORT, run_id);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to get status: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn stop_run(run_id: String) -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/runs/{}/stop", ENGINE_PORT, run_id);
    let client = reqwest::Client::new();
    let resp = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to stop run: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn list_runs() -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/runs", ENGINE_PORT);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to list runs: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn get_models() -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/models", ENGINE_PORT);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to get models: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn get_thermal() -> Result<serde_json::Value, String> {
    let url = format!("http://localhost:{}/thermal", ENGINE_PORT);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to get thermal: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

#[tauri::command]
fn get_engine_port() -> u16 {
    ENGINE_PORT
}

fn start_engine(app_handle: &tauri::AppHandle) -> Option<Child> {
    let bun_path = dirs::home_dir()
        .map(|h| h.join(".bun/bin/bun"))
        .unwrap_or_else(|| "bun".into());

    let engine_dir = app_handle
        .path()
        .resource_dir()
        .ok()
        .and_then(|p: PathBuf| {
            let engine = p.join("../../../engine");
            if engine.exists() { Some(engine) } else { None }
        })
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_default()
                .join("../engine")
        });

    println!("[RS] Starting engine from {:?} with {:?}", engine_dir, bun_path);

    match Command::new(bun_path)
        .arg("run")
        .arg("index.ts")
        .env("RS_ENGINE_PORT", ENGINE_PORT.to_string())
        .current_dir(&engine_dir)
        .spawn()
    {
        Ok(child) => {
            println!("[RS] Engine started (pid: {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[RS] Failed to start engine: {}", e);
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(EngineProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let child = start_engine(&handle);
            let state: State<EngineProcess> = app.state();
            *state.0.lock().unwrap() = child;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_health,
            start_run,
            get_run_status,
            stop_run,
            list_runs,
            get_models,
            get_thermal,
            get_engine_port
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Engine process cleanup handled by OS when parent exits
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running RecursiveSerendipity");
}
