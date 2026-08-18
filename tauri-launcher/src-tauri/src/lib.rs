// ============================================================================
//  PRAMOCHAK MINECRAFT STUDIO LAUNCHER (TAURI V2 RUST KERNEL LIB)
//  Author:    Maheshwar Hari Tripathi
//  Copyright: Copyright (c) 2026 Maheshwar Hari Tripathi. All rights reserved.
//  License:   MIT License
//  Website:   https://github.com/maheshwarkibehan-hub/pramochak-mc-launcher
//  Watermark: PRAMOCHAK-RUST-LIB-SECURE-ID: MHT-MC-RUST-2026
// ============================================================================

use std::process::{Command, Stdio, ChildStdin};
use std::sync::{Mutex, Arc};
use std::io::{BufReader, BufRead, Write};
use std::collections::HashMap;
use tokio::sync::oneshot;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Manager, State, Emitter};

// Structural model for standard JSON RPC messages
#[derive(Serialize, Deserialize, Debug)]
struct RequestMessage {
    id: String,
    cmd: String,
    args: Vec<Value>,
}

#[derive(Deserialize, Debug)]
struct ResponseMessage {
    id: Option<String>,
    #[serde(rename = "type")]
    msg_type: String,
    event: Option<String>,
    payload: Option<Value>,
    success: Option<bool>,
    result: Option<Value>,
    error: Option<String>,
}

// Global State
struct BackendState {
    stdin: Mutex<Option<ChildStdin>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
}

static REQUEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(window: tauri::Window) {
    if let Ok(is_maximized) = window.is_maximized() {
        if is_maximized {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
async fn call_backend(
    cmd: String,
    args: Vec<Value>,
    state: State<'_, Arc<BackendState>>,
) -> Result<Value, String> {
    let id = REQUEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst).to_string();
    
    let (tx, rx) = oneshot::channel();
    
    // Insert into pending map
    {
        let mut pending = state.pending.lock().unwrap();
        pending.insert(id.clone(), tx);
    }
    
    // Write request to sidecar stdin
    let req = RequestMessage {
        id,
        cmd,
        args,
    };
    
    let req_str = serde_json::to_string(&req).unwrap() + "\n";
    
    {
        let mut stdin_lock = state.stdin.lock().unwrap();
        if let Some(ref mut stdin) = *stdin_lock {
            if let Err(e) = stdin.write_all(req_str.as_bytes()) {
                return Err(format!("Failed to write to sidecar: {:?}", e));
            }
            let _ = stdin.flush();
        } else {
            return Err("Sidecar process stdin is not active".to_string());
        }
    }
    
    // Wait for the response
    match rx.await {
        Ok(result) => result,
        Err(_) => Err("Sidecar channel closed before receiving response".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(BackendState {
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
    });
    
    let state_clone = state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state.clone())
        .setup(move |app| {
            // Find sidecar binary path
            // 1. In production, the installer places `backend-worker.exe` next to the main executable
            let mut sidecar_path = std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .join("backend-worker.exe");
            
            if !sidecar_path.exists() {
                // 2. In dev mode, we look for it in src-tauri/bin/ with the target triple
                let resource_dir = app.path().resource_dir().expect("failed to get resource dir");
                let dev_path = resource_dir.join("../../bin/backend-worker-x86_64-pc-windows-msvc.exe");
                if dev_path.exists() {
                    sidecar_path = dev_path;
                } else {
                    let local_path = std::env::current_dir().unwrap().join("bin/backend-worker-x86_64-pc-windows-msvc.exe");
                    if local_path.exists() {
                        sidecar_path = local_path;
                    }
                }
            }
            
            let mut cmd = if sidecar_path.exists() {
                println!("[RUST] Spawning sidecar at: {:?}", sidecar_path);
                let mut c = Command::new(&sidecar_path);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    c.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                c
            } else {
                println!("[RUST] Sidecar binary not found. Spawning 'node backend.cjs' directly in dev mode...");
                let backend_path = std::env::current_dir()
                    .unwrap()
                    .join("backend.cjs");
                let mut c = Command::new("node");
                if backend_path.exists() {
                    c.arg(backend_path);
                } else {
                    let parent_backend = std::env::current_dir()
                        .unwrap()
                        .join("../backend.cjs");
                    c.arg(parent_backend);
                }
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    c.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                c
            };
            
            let mut child = cmd
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .expect("failed to spawn sidecar backend process");
                
            let child_stdin = child.stdin.take().expect("failed to open child stdin");
            let child_stdout = child.stdout.take().expect("failed to open child stdout");
            
            *state_clone.stdin.lock().unwrap() = Some(child_stdin);
            
            let app_handle = app.handle().clone();
            let state_for_reader = state_clone.clone();
            
            std::thread::spawn(move || {
                let reader = BufReader::new(child_stdout);
                for line_result in reader.lines() {
                    match line_result {
                        Ok(line) => {
                            if let Ok(msg) = serde_json::from_str::<ResponseMessage>(&line) {
                                if msg.msg_type == "event" {
                                    if let Some(event_name) = msg.event {
                                        let payload = msg.payload.unwrap_or(Value::Null);
                                        let _ = app_handle.emit(&event_name, payload);
                                    }
                                } else if msg.msg_type == "response" {
                                    if let Some(id) = msg.id {
                                        let mut pending = state_for_reader.pending.lock().unwrap();
                                        if let Some(tx) = pending.remove(&id) {
                                            let success = msg.success.unwrap_or(false);
                                            if success {
                                                let _ = tx.send(Ok(msg.result.unwrap_or(Value::Null)));
                                            } else {
                                                let _ = tx.send(Err(msg.error.unwrap_or("Unknown error".to_string())));
                                            }
                                        }
                                    }
                                }
                            } else {
                                println!("[RUST-SIDECAR-RAW] {}", line);
                            }
                        }
                        Err(e) => {
                            eprintln!("[RUST-SIDECAR-ERROR] Failed to read line: {:?}", e);
                            break;
                        }
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            maximize_window,
            close_window,
            call_backend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
