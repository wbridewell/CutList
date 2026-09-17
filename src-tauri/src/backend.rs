// Spawning the Node backend for one command, streaming its progress events, collecting
// its result, and cancelling it. The commands that simply forward a payload to the backend
// are declared here through desktop_value_command!.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdout, Stdio},
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::{AppHandle, Emitter};

use crate::desktop_log::append_log_line;

use crate::error::*;
use crate::runtime::*;
use crate::timing::*;

pub(crate) const DESKTOP_PROGRESS_EVENT_NAME: &str = "cutlist://curator-progress";

#[derive(Clone, Default)]
pub(crate) struct DesktopState {
    pub(crate) requests: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    pub(crate) cancelled: Arc<Mutex<HashSet<String>>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct CommandEnvelope {
    pub(crate) command: String,
    pub(crate) payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum BackendLine {
    Progress { event: Value },
    Result { data: Value },
    Error { error: BackendErrorPayload },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProgressPayload {
    pub(crate) request_id: String,
    pub(crate) event: Value,
}

pub(crate) fn spawn_backend_command(
    app: &AppHandle,
    state: &DesktopState,
    request_id: Option<&str>,
    timing_id: &str,
    envelope: &CommandEnvelope,
) -> Result<(Arc<Mutex<Child>>, ChildStdout), DesktopError> {
    let mut command = desktop_command_runner(app)
        .map_err(|message| DesktopError::new("runtime_missing", message))?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("CUTLIST_TIMING_ID", timing_id);

    let started_at = Instant::now();
    let mut child = command.spawn().map_err(|error| {
        DesktopError::new(
            "spawn_failed",
            format!("Failed to start desktop backend: {error}"),
        )
    })?;

    {
        let mut stdin = child.stdin.take().ok_or_else(|| {
            DesktopError::new("spawn_failed", "Desktop backend stdin is unavailable.")
        })?;
        let body = serde_json::to_vec(envelope).map_err(|error| {
            DesktopError::new(
                "spawn_failed",
                format!("Failed to encode desktop command: {error}"),
            )
        })?;
        stdin.write_all(&body).map_err(|error| {
            DesktopError::new(
                "spawn_failed",
                format!("Failed to send desktop command: {error}"),
            )
        })?;
    }

    let stdout = child.stdout.take().ok_or_else(|| {
        DesktopError::new("spawn_failed", "Desktop backend stdout is unavailable.")
    })?;

    // A packaged .app launched from Finder has nowhere for inherited stderr to go, so we
    // pump it into the app-data log file instead. In dev builds we also echo it to the
    // terminal to preserve the existing `npm run dev` console output.
    if let Some(stderr) = child.stderr.take() {
        let log_app = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if cfg!(debug_assertions) {
                    eprintln!("{line}");
                }
                append_log_line(&log_app, &line);
            }
        });
    }

    let child = Arc::new(Mutex::new(child));

    if let Some(request_id) = request_id {
        if let Ok(mut requests) = state.requests.lock() {
            requests.insert(request_id.to_string(), Arc::clone(&child));
        }
    }

    log_timing("process_spawn", &envelope.command, timing_id, started_at);
    Ok((child, stdout))
}

pub(crate) fn finish_request(state: &DesktopState, request_id: &str) -> bool {
    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(request_id);
    }
    if let Ok(mut cancelled) = state.cancelled.lock() {
        return cancelled.remove(request_id);
    }
    false
}

pub(crate) fn run_backend_command(
    app: &AppHandle,
    state: &DesktopState,
    request_id: Option<&str>,
    envelope: CommandEnvelope,
) -> Result<Value, DesktopError> {
    let timing_id = next_timing_id();
    let started_at = Instant::now();
    let result = (|| -> Result<Value, DesktopError> {
        let (child, stdout) = spawn_backend_command(app, state, request_id, &timing_id, &envelope)?;
        let reader = BufReader::new(stdout);
        let mut final_result: Option<Value> = None;
        let mut backend_error: Option<DesktopError> = None;
        let mut saw_backend_line = false;

        for line in reader.lines() {
            let line = line.map_err(|error| {
                DesktopError::new(
                    "backend_protocol",
                    format!("Failed reading desktop backend output: {error}"),
                )
            })?;
            if !saw_backend_line {
                saw_backend_line = true;
                log_timing(
                    "process_first_output",
                    &envelope.command,
                    &timing_id,
                    started_at,
                );
            }
            let parsed: BackendLine = serde_json::from_str(&line).map_err(|error| {
                DesktopError::new(
                    "backend_protocol",
                    format!("Failed to parse desktop backend output: {error}"),
                )
            })?;
            match parsed {
                BackendLine::Progress { event } => {
                    if let Some(request_id) = request_id {
                        let _ = app.emit(
                            DESKTOP_PROGRESS_EVENT_NAME,
                            DesktopProgressPayload {
                                request_id: request_id.to_string(),
                                event,
                            },
                        );
                    }
                }
                BackendLine::Result { data } => {
                    final_result = Some(data);
                }
                BackendLine::Error { error } => {
                    backend_error = Some(error.into());
                }
            }
        }

        let status = child
            .lock()
            .map_err(|_| {
                DesktopError::new("spawn_failed", "Desktop backend process is unavailable.")
            })?
            .wait()
            .map_err(|error| {
                DesktopError::new(
                    "spawn_failed",
                    format!("Failed waiting on desktop backend: {error}"),
                )
            })?;

        let was_cancelled = request_id
            .map(|value| finish_request(state, value))
            .unwrap_or(false);
        if was_cancelled {
            return Err(DesktopError::new("cancelled", "Request interrupted."));
        }
        if let Some(error) = backend_error {
            return Err(error);
        }
        if !status.success() {
            return Err(DesktopError::new(
                "backend_protocol",
                format!("Desktop backend exited with status {status}."),
            ));
        }

        final_result.ok_or_else(|| {
            DesktopError::new(
                "backend_protocol",
                "Desktop backend did not return a result.",
            )
        })
    })();

    log_timing(
        "command_roundtrip",
        &envelope.command,
        &timing_id,
        started_at,
    );
    let outcome = match &result {
        Ok(_) => "ok".to_string(),
        Err(error) => format!("error: {error}"),
    };
    append_log_line(
        app,
        &format!(
            "command={} id={} duration_ms={} outcome={outcome}",
            envelope.command,
            timing_id,
            started_at.elapsed().as_millis()
        ),
    );
    result
}

#[tauri::command]
pub async fn desktop_playlist_message(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
    request_id: String,
    payload: Value,
) -> Result<Value, DesktopError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_backend_command(
            &app,
            &state,
            Some(&request_id),
            CommandEnvelope {
                command: "playlistMessage".to_string(),
                payload: Some(payload),
            },
        )
    })
    .await
    .map_err(|error| {
        DesktopError::new(
            "spawn_failed",
            format!("Desktop backend task failed: {error}"),
        )
    })?
}

#[tauri::command]
pub fn desktop_cancel_request(
    state: tauri::State<'_, DesktopState>,
    request_id: String,
) -> Result<(), String> {
    let child = {
        let requests = state
            .requests
            .lock()
            .map_err(|_| "Desktop request registry is unavailable.".to_string())?;
        requests.get(&request_id).cloned()
    };

    if let Some(child) = child {
        {
            let mut cancelled = state
                .cancelled
                .lock()
                .map_err(|_| "Desktop cancel registry is unavailable.".to_string())?;
            cancelled.insert(request_id);
        }
        child
            .lock()
            .map_err(|_| "Desktop request process is unavailable.".to_string())?
            .kill()
            .map_err(|error| format!("Failed to interrupt desktop request: {error}"))?;
    }

    Ok(())
}

macro_rules! desktop_value_command {
    ($name:ident, $command:literal) => {
        #[tauri::command]
        pub async fn $name(
            app: AppHandle,
            state: tauri::State<'_, DesktopState>,
            payload: Option<Value>,
        ) -> Result<Value, DesktopError> {
            let state = state.inner().clone();
            tauri::async_runtime::spawn_blocking(move || {
                run_backend_command(
                    &app,
                    &state,
                    None,
                    CommandEnvelope {
                        command: $command.to_string(),
                        payload,
                    },
                )
            })
            .await
            .map_err(|error| {
                DesktopError::new(
                    "spawn_failed",
                    format!("Desktop backend task failed: {error}"),
                )
            })?
        }
    };
}

desktop_value_command!(desktop_verify_tracks, "verifyTracks");

desktop_value_command!(desktop_import_chat, "importChat");

desktop_value_command!(desktop_analyze_playlist, "analyzePlaylist");

desktop_value_command!(desktop_plan_user_request, "planUserRequest");

desktop_value_command!(desktop_get_llm_setup, "getLlmSetup");

desktop_value_command!(desktop_save_llm_setup, "saveLlmSetup");

desktop_value_command!(desktop_test_llm_setup, "testLlmSetup");

desktop_value_command!(desktop_save_workspace_state, "saveWorkspaceState");
