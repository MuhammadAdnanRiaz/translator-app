use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

// ── Config ────────────────────────────────────────────────────────────────────

fn config_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("config.json")
}

#[derive(Serialize, Deserialize, Default)]
struct Config {
    model_path: Option<String>,
}

fn read_config(app: &AppHandle) -> Config {
    let path = config_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_model_path(app: AppHandle) -> Option<String> {
    read_config(&app).model_path
}

#[tauri::command]
fn save_model_path(app: AppHandle, path: String) -> Result<(), String> {
    write_config(&app, &Config { model_path: Some(path) })
}

// ── Server management ─────────────────────────────────────────────────────────

fn find_llama_server() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/llama-server",
        "/usr/local/bin/llama-server",
        "llama-server",
    ];
    candidates
        .iter()
        .find(|p| std::path::Path::new(p).exists() || which_llama(p))
        .map(|s| s.to_string())
}

fn which_llama(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
fn start_server(model_path: String) -> Result<(), String> {
    let binary = find_llama_server()
        .ok_or("llama-server not found. Install with: brew install llama.cpp")?;

    let mut lock = SERVER_PROCESS.lock().unwrap();

    // Kill any existing process
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
    }

    let child = Command::new(&binary)
        .args([
            "--model", &model_path,
            "--port", "8080",
            "--ctx-size", "2048",
            "--n-predict", "1024",
            "-ngl", "99",   // offload all layers to GPU (Metal on M-series)
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start llama-server: {}", e))?;

    *lock = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_server() {
    if let Ok(mut lock) = SERVER_PROCESS.lock() {
        if let Some(mut child) = lock.take() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
async fn server_ready() -> bool {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    client
        .get("http://127.0.0.1:8080/health")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// ── Translation ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: i32,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

fn system_prompt(tone: &str, locale: &str) -> String {
    let locale_style = match locale {
        "uk" => "British English (use British spelling: organise, favour, whilst, apologise)",
        "belgium" => "clear formal international English suitable for Belgian business context",
        _ => "American English (use American spelling and idioms)",
    };

    let tone_style = match (tone, locale) {
        ("developer", "us") => {
            "like a professional American software developer — direct, technical, use phrases like \
             'reach out', 'circle back', 'touch base', 'loop in', 'happy to help'"
        }
        ("developer", "uk") => {
            "like a professional British software developer — polite, precise, restrained, \
             use phrases like 'I'll look into this', 'cheers', 'brilliant', 'quite right'"
        }
        ("developer", _) => {
            "like a professional software developer — formal, clear, unambiguous, technically precise"
        }
        ("casual", "us") => {
            "like a friendly American — warm, natural contractions, approachable, \
             casual but respectful, as if talking to a colleague"
        }
        ("casual", "uk") => {
            "like a friendly British person — warm, understated, polite, natural British tone, \
             conversational but respectful"
        }
        ("casual", _) => {
            "in a friendly, clear, and professional casual style appropriate for international business"
        }
        _ => "professionally and clearly",
    };

    format!(
        "You are an expert English editor specializing in professional communication. \
         Rewrite the following message in {} and sound {}. \
         Preserve the original meaning exactly — do not add or remove information. \
         Fix grammar, improve fluency, and make it sound like a native speaker wrote it. \
         Return ONLY the rewritten message. No explanations, no quotes, no preamble.",
        locale_style, tone_style
    )
}

#[tauri::command]
async fn translate(text: String, tone: String, locale: String) -> Result<String, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let body = ChatRequest {
        model: "local".to_string(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt(&tone, &locale),
            },
            ChatMessage {
                role: "user".to_string(),
                content: text,
            },
        ],
        temperature: 0.3,
        max_tokens: 1024,
        stream: false,
    };

    let response = client
        .post("http://127.0.0.1:8080/v1/chat/completions")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let parsed: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "Empty response from model".to_string())
}

// ── App entry ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                stop_server();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_model_path,
            save_model_path,
            start_server,
            stop_server,
            server_ready,
            translate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
