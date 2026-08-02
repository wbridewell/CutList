mod desktop_log;
mod secrets;

use desktop_log::{append_log_line, ensure_log_file};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs::{create_dir_all, metadata, read_to_string, remove_file, rename, write},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdout, Command, Stdio},
    sync::mpsc,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const DESKTOP_PROGRESS_EVENT_NAME: &str = "cutlist://curator-progress";
static NEXT_TIMING_ID: AtomicU64 = AtomicU64::new(1);

fn debug_timing_enabled() -> bool {
    std::env::var("CUTLIST_DEBUG_TIMING").as_deref() == Ok("1")
}

fn next_timing_id() -> String {
    format!("{:x}", NEXT_TIMING_ID.fetch_add(1, Ordering::Relaxed))
}

fn log_timing(event: &str, command: &str, timing_id: &str, started_at: Instant) {
    if debug_timing_enabled() {
        eprintln!(
            "[cutlist:timing] {event} command={command} id={timing_id} duration_ms={}",
            started_at.elapsed().as_millis()
        );
    }
}

#[derive(Clone, Default)]
struct DesktopState {
    requests: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

#[derive(Debug, Deserialize, Serialize)]
struct CommandEnvelope {
    command: String,
    payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BackendLine {
    Progress { event: Value },
    Result { data: Value },
    Error { error: BackendErrorPayload },
}

#[derive(Debug, Deserialize)]
struct BackendErrorPayload {
    code: String,
    message: String,
}

// The error type returned from every Tauri command that talks to the Node backend.
// `code` is one of the DesktopErrorCode values defined in src/lib/desktop/contracts.ts;
// Rust either classifies its own failures (spawn/protocol/runtime) or passes through
// whatever code the Node backend already classified in desktop/command.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopError {
    code: String,
    message: String,
}

impl DesktopError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for DesktopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

impl From<BackendErrorPayload> for DesktopError {
    fn from(payload: BackendErrorPayload) -> Self {
        Self {
            code: payload.code,
            message: payload.message,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopProgressPayload {
    request_id: String,
    event: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopExportPayload {
    format: String,
}

#[derive(Debug, Deserialize)]
struct BackendExportResponse {
    content: String,
    filename: String,
}

fn desktop_export_filter(format: &str) -> (&'static str, &'static [&'static str]) {
    match format {
        "migration_csv" | "csv" => ("CSV", &["csv"]),
        "m3u" => ("M3U", &["m3u"]),
        "m3u8" => ("M3U8", &["m3u8"]),
        "txt" => ("Text", &["txt"]),
        "json" => ("JSON", &["json"]),
        "apple_music_xml" => ("XML", &["xml"]),
        _ => ("Export", &[]),
    }
}

fn desktop_export_filters(format: &str) -> Vec<(&'static str, &'static [&'static str])> {
    let preferred = desktop_export_filter(format);
    let mut filters = vec![preferred];
    for candidate in [
        desktop_export_filter("migration_csv"),
        desktop_export_filter("m3u"),
        desktop_export_filter("m3u8"),
        desktop_export_filter("txt"),
        desktop_export_filter("json"),
        desktop_export_filter("apple_music_xml"),
    ] {
        if candidate != preferred {
            filters.push(candidate);
        }
    }
    filters
}

fn replace_file_contents(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Desktop export path must have a parent directory.".to_string())?;
    create_dir_all(parent).map_err(|error| format!("Failed to create export directory: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Desktop export path must end in a valid file name.".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.cutlist-export"));
    write(&temp_path, content).map_err(|error| format!("Failed to write export file: {error}"))?;
    // rename() over an existing file is atomic on the platforms we target, so there is no
    // window where `path` is briefly missing between removing the old file and placing the new one.
    if let Err(error) = rename(&temp_path, path) {
        let _ = remove_file(&temp_path);
        return Err(format!("Failed to move export file into place: {error}"));
    }
    Ok(())
}

pub(crate) fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn dev_desktop_command_runner() -> Result<Command, String> {
    let root = project_root();
    let mut command = Command::new("node");
    command
        .arg("node_modules/tsx/dist/cli.mjs")
        .arg("desktop/command.ts")
        .current_dir(&root)
        .env("NODE_OPTIONS", "--conditions=react-server")
        .env("CUTLIST_DESKTOP_DATA_DIR", root.join(".cutlist-desktop-data"));
    Ok(command)
}

fn bundled_node_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

fn packaged_runtime_missing_error(detail: &str) -> String {
    format!(
        "This copy of The CutList is missing part of its bundled desktop runtime ({detail}). Reinstall the app from the DMG, then try again. If it still fails, report this issue on GitHub."
    )
}

fn packaged_runtime_paths(runtime_dir: &Path) -> (PathBuf, PathBuf) {
    (
        runtime_dir.join("node").join(bundled_node_executable_name()),
        runtime_dir.join("app").join("desktop").join("command.js"),
    )
}

fn validate_packaged_runtime_dir(runtime_dir: &Path) -> Result<(), String> {
    if !runtime_dir.exists() {
        return Err(packaged_runtime_missing_error("runtime folder"));
    }

    let (node_path, command_path) = packaged_runtime_paths(runtime_dir);
    if !node_path.is_file() {
        return Err(packaged_runtime_missing_error("bundled Node runtime"));
    }
    if !command_path.is_file() {
        return Err(packaged_runtime_missing_error("desktop backend command"));
    }

    #[cfg(unix)]
    {
        let mode = metadata(&node_path)
            .map_err(|_| packaged_runtime_missing_error("bundled Node runtime"))?
            .permissions()
            .mode();
        if mode & 0o111 == 0 {
            return Err(packaged_runtime_missing_error("bundled Node runtime permissions"));
        }
    }

    Ok(())
}

fn validate_packaged_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let runtime_dir = app
        .path()
        .resolve(".desktop-runtime", BaseDirectory::Resource)
        .map_err(|_| packaged_runtime_missing_error("runtime folder"))?;
    validate_packaged_runtime_dir(&runtime_dir)?;
    Ok(runtime_dir)
}

fn show_packaged_runtime_error(app: &AppHandle, message: String) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        app_handle
            .dialog()
            .message(message)
            .title("The CutList")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::Ok)
            .blocking_show();
        app_handle.exit(1);
    });
}

// Mirrors llmConfig.ts's settingsPath() resolution so this runs against the same file
// Node reads/writes. Node owns the schema for this file; this function only ever touches
// the two provider-key fields, leaving every other field untouched.
fn local_llm_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit_path) = std::env::var("CUTLIST_LLM_SETTINGS_PATH") {
        let path = PathBuf::from(explicit_path);
        return if path.is_absolute() {
            Ok(path)
        } else {
            std::env::current_dir()
                .map(|dir| dir.join(path))
                .map_err(|error| format!("Failed to resolve local LLM settings path: {error}"))
        };
    }

    if cfg!(debug_assertions) {
        return Ok(project_root().join(".cutlist-desktop-data").join(".cutlist.local-settings.json"));
    }

    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join(".cutlist.local-settings.json"))
}

// One-time, idempotent: moves any plaintext provider API keys already sitting in the
// local settings file (from before keychain storage existed) into the OS keychain, then
// rewrites the file with those two fields removed. Best-effort by design — a failure
// here should never block app startup, so every error is swallowed rather than surfaced.
fn migrate_plaintext_provider_keys_to_keychain(app: &AppHandle) {
    let Ok(path) = local_llm_settings_path(app) else {
        return;
    };
    let Ok(raw) = read_to_string(&path) else {
        return;
    };
    let Ok(mut value) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let Some(object) = value.as_object_mut() else {
        return;
    };

    let mut changed = false;
    for (provider, field) in [("gemini", "geminiApiKey"), ("openai", "openaiApiKey")] {
        let Some(Value::String(secret)) = object.get(field) else {
            continue;
        };
        if !secret.trim().is_empty() {
            if secrets::set_provider_secret(provider, secret).is_err() {
                continue;
            }
        }
        object.remove(field);
        changed = true;
    }

    if changed {
        if let Ok(serialized) = serde_json::to_string_pretty(&value) {
            let _ = write(&path, format!("{serialized}\n"));
        }
    }
}

// A genuine shell/`.env.local` override for GEMINI_API_KEY/OPENAI_API_KEY must win over
// whatever is stored in the keychain, so a real inherited value blocks injection here.
fn should_inject_keychain_secret(inherited_env_value: Option<&str>) -> bool {
    inherited_env_value
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
}

// Injects any provider secrets that are stored in the OS keychain as env vars on the
// child process, under the same names resolveLLMConfig() already reads
// (GEMINI_API_KEY/OPENAI_API_KEY), plus a per-provider marker so the frontend can tell
// "keychain" apart from a real OS environment variable override even though both arrive
// through the same underlying env var. This is the only place a stored secret is ever
// read back out of the keychain; it never crosses into the webview.
fn inject_keychain_secrets(command: &mut Command) {
    for provider in secrets::KEYCHAIN_PROVIDERS {
        let (Some(env_var), Some(marker)) = (
            secrets::env_var_name_for(provider),
            secrets::key_source_marker_for(provider),
        ) else {
            continue;
        };
        if !should_inject_keychain_secret(std::env::var(env_var).ok().as_deref()) {
            continue;
        }
        if let Some(secret) = secrets::get_provider_secret(provider) {
            command.env(env_var, secret).env(marker, "1");
        }
    }
}

fn desktop_command_runner(app: &AppHandle) -> Result<Command, String> {
    let mut command = if cfg!(debug_assertions) {
        dev_desktop_command_runner()?
    } else {
        let runtime_dir = validate_packaged_runtime(app)?;
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
        create_dir_all(&app_data_dir)
            .map_err(|error| format!("Failed to create app data directory: {error}"))?;

        let mut command = Command::new(runtime_dir.join("node").join(bundled_node_executable_name()));
        command
            .arg(runtime_dir.join("app").join("desktop").join("command.js"))
            .current_dir(runtime_dir.join("app"))
            .env("NODE_OPTIONS", "--conditions=react-server")
            .env("CUTLIST_DESKTOP_DATA_DIR", app_data_dir);
        command
    };

    inject_keychain_secrets(&mut command);
    Ok(command)
}

fn spawn_backend_command(
    app: &AppHandle,
    state: &DesktopState,
    request_id: Option<&str>,
    timing_id: &str,
    envelope: &CommandEnvelope,
) -> Result<(Arc<Mutex<Child>>, ChildStdout), DesktopError> {
    let mut command =
        desktop_command_runner(app).map_err(|message| DesktopError::new("runtime_missing", message))?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("CUTLIST_TIMING_ID", timing_id);

    let started_at = Instant::now();
    let mut child = command.spawn().map_err(|error| {
        DesktopError::new("spawn_failed", format!("Failed to start desktop backend: {error}"))
    })?;

    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| DesktopError::new("spawn_failed", "Desktop backend stdin is unavailable."))?;
        let body = serde_json::to_vec(envelope).map_err(|error| {
            DesktopError::new("spawn_failed", format!("Failed to encode desktop command: {error}"))
        })?;
        stdin.write_all(&body).map_err(|error| {
            DesktopError::new("spawn_failed", format!("Failed to send desktop command: {error}"))
        })?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| DesktopError::new("spawn_failed", "Desktop backend stdout is unavailable."))?;

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

fn finish_request(state: &DesktopState, request_id: &str) -> bool {
    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(request_id);
    }
    if let Ok(mut cancelled) = state.cancelled.lock() {
        return cancelled.remove(request_id);
    }
    false
}

fn run_backend_command(
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
                DesktopError::new("backend_protocol", format!("Failed reading desktop backend output: {error}"))
            })?;
            if !saw_backend_line {
                saw_backend_line = true;
                log_timing("process_first_output", &envelope.command, &timing_id, started_at);
            }
            let parsed: BackendLine = serde_json::from_str(&line).map_err(|error| {
                DesktopError::new("backend_protocol", format!("Failed to parse desktop backend output: {error}"))
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
            .map_err(|_| DesktopError::new("spawn_failed", "Desktop backend process is unavailable."))?
            .wait()
            .map_err(|error| {
                DesktopError::new("spawn_failed", format!("Failed waiting on desktop backend: {error}"))
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

        final_result.ok_or_else(|| DesktopError::new("backend_protocol", "Desktop backend did not return a result."))
    })();

    log_timing("command_roundtrip", &envelope.command, &timing_id, started_at);
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
async fn desktop_playlist_message(
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
    .map_err(|error| DesktopError::new("spawn_failed", format!("Desktop backend task failed: {error}")))?
}

#[tauri::command]
fn desktop_cancel_request(
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

fn desktop_export_playlist_impl(
    app: &AppHandle,
    state: &DesktopState,
    payload: Option<Value>,
) -> Result<Value, DesktopError> {
    let timing_id = next_timing_id();
    let started_at = Instant::now();
    let payload_value =
        payload.ok_or_else(|| DesktopError::new("invalid_payload", "Desktop export payload is missing."))?;
    let export_request: DesktopExportPayload = serde_json::from_value(payload_value.clone()).map_err(|error| {
        DesktopError::new("invalid_payload", format!("Failed to parse desktop export payload: {error}"))
    })?;
    let export_response = serde_json::from_value::<BackendExportResponse>(run_backend_command(
        app,
        state,
        None,
        CommandEnvelope {
            command: "exportPlaylist".to_string(),
            payload: Some(payload_value.clone()),
        },
    )?)
    .map_err(|error| {
        DesktopError::new("backend_protocol", format!("Failed to parse desktop export response: {error}"))
    })?;

    let dialog_started = Instant::now();
    let (sender, receiver) = mpsc::channel();
    let mut dialog = app.dialog().file().set_file_name(&export_response.filename);
    for (filter_name, filter_extensions) in desktop_export_filters(&export_request.format) {
        if !filter_extensions.is_empty() {
            dialog = dialog.add_filter(filter_name, filter_extensions);
        }
    }
    dialog.save_file(move |path| {
        let _ = sender.send(path);
    });
    let selected_path = receiver.recv().map_err(|error| {
        DesktopError::new("export_failed", format!("Failed waiting for desktop save dialog: {error}"))
    })?;
    log_timing("desktop_export_dialog", "exportPlaylist", &timing_id, dialog_started);

    let Some(selected_path) = selected_path else {
        log_timing("command_roundtrip", "exportPlaylist", &timing_id, started_at);
        return Ok(json!({ "status": "cancelled" }));
    };

    let path = selected_path.into_path().map_err(|_| {
        DesktopError::new("export_failed", "Desktop save dialog returned a non-local path.")
    })?;
    let save_started = Instant::now();
    replace_file_contents(&path, &export_response.content)
        .map_err(|message| DesktopError::new("export_failed", message))?;
    log_timing("desktop_export_save", "exportPlaylist", &timing_id, save_started);
    log_timing("command_roundtrip", "exportPlaylist", &timing_id, started_at);
    Ok(json!({
        "status": "saved",
        "filename": export_response.filename,
        "path": path.to_string_lossy().into_owned()
    }))
}

fn desktop_workspace_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit_path) = std::env::var("CUTLIST_DESKTOP_WORKSPACE_STATE_PATH") {
        let path = PathBuf::from(explicit_path);
        return if path.is_absolute() {
            Ok(path)
        } else {
            std::env::current_dir()
                .map(|dir| dir.join(path))
                .map_err(|error| format!("Failed to resolve workspace state path: {error}"))
        };
    }

    if cfg!(debug_assertions) {
        return Ok(project_root().join(".cutlist-desktop-data").join("workspace-state.json"));
    }

    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("workspace-state.json"))
}

#[tauri::command]
fn desktop_reveal_in_file_manager(path: String) -> Result<Value, String> {
    let target = PathBuf::from(&path);
    if !target.is_absolute() {
        return Err("Desktop reveal path must be absolute.".to_string());
    }
    if !target.exists() {
        return Err("Desktop reveal path no longer exists.".to_string());
    }

    let mut command = if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg("-R").arg(&target);
        command
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("explorer");
        command.arg("/select,").arg(&target);
        command
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| "Desktop reveal path must have a parent directory.".to_string())?;
        let mut command = Command::new("xdg-open");
        command.arg(parent);
        command
    };

    command
        .spawn()
        .map_err(|error| format!("Failed to reveal exported file: {error}"))?;

    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn desktop_get_log_path(app: AppHandle) -> Result<Value, String> {
    let path = ensure_log_file(&app)?;
    Ok(json!({ "path": path.to_string_lossy() }))
}

fn validate_keychain_provider(provider: &str) -> Result<(), String> {
    if secrets::KEYCHAIN_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("Unknown provider for keychain storage: {provider}"))
    }
}

// There is deliberately no getter exposed here: once a key is in the keychain, the only
// way it leaves Rust is injected directly into the backend child process env
// (see inject_keychain_secrets). The webview can set and delete but never read it back.
#[tauri::command]
fn desktop_set_provider_secret(provider: String, secret: String) -> Result<Value, String> {
    validate_keychain_provider(&provider)?;
    secrets::set_provider_secret(&provider, &secret)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn desktop_delete_provider_secret(provider: String) -> Result<Value, String> {
    validate_keychain_provider(&provider)?;
    secrets::delete_provider_secret(&provider)?;
    Ok(json!({ "ok": true }))
}

fn quarantine_workspace_file(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Workspace state path must have a parent directory.".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let quarantine_path = parent.join(format!("workspace-state.damaged-{timestamp}.json"));
    rename(path, &quarantine_path)
        .map_err(|error| format!("Failed to back up unreadable workspace state: {error}"))?;
    Ok(quarantine_path)
}

// Reads the workspace file directly rather than round-tripping through the Node backend,
// since a cold backend spawn (~2.5s measured) would land squarely on first-launch time-to-workspace.
// This means the Zod schema in localDraft.ts never sees this data on the way in, so the client
// is responsible for validating `state` and calling desktop_quarantine_workspace_state itself
// if it turns out to be schema-invalid despite being valid JSON.
#[tauri::command]
fn desktop_get_workspace_state(app: AppHandle) -> Result<Value, String> {
    let path = desktop_workspace_state_path(&app)?;
    let raw = match read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(json!({ "status": "empty", "state": null, "recoveredPath": null }));
        }
        Err(error) => return Err(format!("Failed to read workspace state: {error}")),
    };

    match serde_json::from_str::<Value>(&raw) {
        Ok(state) => Ok(json!({ "status": "ok", "state": state, "recoveredPath": null })),
        Err(_) => {
            let quarantine_path = quarantine_workspace_file(&path)?;
            Ok(json!({
                "status": "unreadable",
                "state": null,
                "recoveredPath": quarantine_path.to_string_lossy()
            }))
        }
    }
}

#[tauri::command]
fn desktop_quarantine_workspace_state(app: AppHandle) -> Result<Value, String> {
    let path = desktop_workspace_state_path(&app)?;
    if !path.exists() {
        return Ok(json!({ "recoveredPath": null }));
    }
    let quarantine_path = quarantine_workspace_file(&path)?;
    Ok(json!({ "recoveredPath": quarantine_path.to_string_lossy() }))
}

macro_rules! desktop_value_command {
    ($name:ident, $command:literal) => {
        #[tauri::command]
        async fn $name(
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
            .map_err(|error| DesktopError::new("spawn_failed", format!("Desktop backend task failed: {error}")))?
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

#[tauri::command]
async fn desktop_export_playlist(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
    payload: Option<Value>,
) -> Result<Value, DesktopError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || desktop_export_playlist_impl(&app, &state, payload))
        .await
        .map_err(|error| DesktopError::new("spawn_failed", format!("Desktop backend task failed: {error}")))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            migrate_plaintext_provider_keys_to_keychain(app.handle());
            if !cfg!(debug_assertions) {
                if let Err(error) = validate_packaged_runtime(app.handle()) {
                    show_packaged_runtime_error(app.handle(), error);
                }
            }
            Ok(())
        })
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_analyze_playlist,
            desktop_cancel_request,
            desktop_delete_provider_secret,
            desktop_export_playlist,
            desktop_get_llm_setup,
            desktop_get_log_path,
            desktop_get_workspace_state,
            desktop_import_chat,
            desktop_plan_user_request,
            desktop_playlist_message,
            desktop_quarantine_workspace_state,
            desktop_reveal_in_file_manager,
            desktop_save_llm_setup,
            desktop_save_workspace_state,
            desktop_set_provider_secret,
            desktop_test_llm_setup,
            desktop_verify_tracks
        ])
        .run(tauri::generate_context!())
        .expect("error while running The CutList desktop app");
}

#[cfg(test)]
mod tests {
    use super::{
        desktop_export_filter, desktop_export_filters, packaged_runtime_missing_error,
        quarantine_workspace_file, replace_file_contents, should_inject_keychain_secret,
        validate_keychain_provider, validate_packaged_runtime_dir, BackendErrorPayload,
        DesktopError,
    };
    use std::{
        fs::{create_dir_all, read_to_string, remove_dir_all, write},
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn injects_keychain_secret_when_no_env_var_is_inherited() {
        assert!(should_inject_keychain_secret(None));
    }

    #[test]
    fn injects_keychain_secret_when_inherited_env_var_is_blank() {
        assert!(should_inject_keychain_secret(Some("")));
        assert!(should_inject_keychain_secret(Some("   ")));
    }

    #[test]
    fn does_not_override_a_genuine_inherited_env_var_with_a_keychain_secret() {
        assert!(!should_inject_keychain_secret(Some("sk-real-shell-key")));
    }

    #[test]
    fn maps_export_formats_to_expected_dialog_filters() {
        for (format, label, extension) in [
            ("migration_csv", "CSV", "csv"),
            ("csv", "CSV", "csv"),
            ("m3u", "M3U", "m3u"),
            ("m3u8", "M3U8", "m3u8"),
            ("txt", "Text", "txt"),
            ("json", "JSON", "json"),
            ("apple_music_xml", "XML", "xml"),
        ] {
            let (actual_label, actual_extensions) = desktop_export_filter(format);
            assert_eq!(actual_label, label);
            assert_eq!(actual_extensions, [extension]);
        }
    }

    #[test]
    fn export_dialog_lists_current_format_first_then_other_supported_extensions() {
        let filters = desktop_export_filters("json");
        assert_eq!(filters.first().copied(), Some(("JSON", &["json"][..])));
        assert!(filters.contains(&("CSV", &["csv"][..])));
        assert!(filters.contains(&("M3U", &["m3u"][..])));
        assert!(filters.contains(&("M3U8", &["m3u8"][..])));
        assert!(filters.contains(&("Text", &["txt"][..])));
        assert!(filters.contains(&("XML", &["xml"][..])));
    }

    #[test]
    fn replaces_existing_export_file() {
        let test_dir = std::env::temp_dir().join(format!(
            "cutlist-export-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("playlist.json");
        write(&path, "old").unwrap();

        replace_file_contents(&path, "new").unwrap();

        assert_eq!(read_to_string(&path).unwrap(), "new");
        remove_dir_all(test_dir).unwrap();
    }

    fn unique_temp_dir(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "{prefix}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[cfg(unix)]
    fn write_executable(path: &Path, body: &str) {
        use std::os::unix::fs::PermissionsExt;

        write(path, body).unwrap();
        let mut permissions = std::fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).unwrap();
    }

    #[test]
    fn packaged_runtime_error_mentions_dmg_reinstall() {
        let message = packaged_runtime_missing_error("bundled Node runtime");
        assert!(message.contains("Reinstall the app from the DMG"));
        assert!(message.contains("report this issue on GitHub"));
    }

    #[test]
    fn packaged_runtime_validation_rejects_missing_runtime_folder() {
        let error = validate_packaged_runtime_dir(Path::new("/definitely/missing/cutlist-runtime")).unwrap_err();
        assert!(error.contains("runtime folder"));
        assert!(error.contains("Reinstall the app from the DMG"));
    }

    #[cfg(unix)]
    #[test]
    fn packaged_runtime_validation_rejects_missing_backend_files() {
        let runtime_dir = unique_temp_dir("cutlist-runtime-check");
        create_dir_all(runtime_dir.join("node")).unwrap();
        write_executable(&runtime_dir.join("node").join("node"), "#!/bin/sh\nexit 0\n");

        let error = validate_packaged_runtime_dir(&runtime_dir).unwrap_err();
        assert!(error.contains("desktop backend command"));

        remove_dir_all(runtime_dir).unwrap();
    }

    #[test]
    fn quarantine_renames_the_file_with_a_damaged_marker_and_preserves_contents() {
        let test_dir = unique_temp_dir("cutlist-workspace-quarantine");
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("workspace-state.json");
        write(&path, "not valid json").unwrap();

        let quarantine_path = quarantine_workspace_file(&path).unwrap();

        assert!(!path.exists());
        assert!(quarantine_path.exists());
        assert!(quarantine_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("workspace-state.damaged-") && name.ends_with(".json")));
        assert_eq!(read_to_string(&quarantine_path).unwrap(), "not valid json");

        remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn quarantine_fails_clearly_when_the_source_file_is_missing() {
        let test_dir = unique_temp_dir("cutlist-workspace-quarantine-missing");
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("workspace-state.json");

        let error = quarantine_workspace_file(&path).unwrap_err();
        assert!(error.contains("Failed to back up unreadable workspace state"));

        remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn desktop_error_serializes_to_the_shape_the_frontend_expects() {
        let error = DesktopError::new("llm_timeout", "The model took too long to respond.");

        let value = serde_json::to_value(&error).unwrap();

        assert_eq!(value["code"], "llm_timeout");
        assert_eq!(value["message"], "The model took too long to respond.");
    }

    #[test]
    fn desktop_error_display_includes_code_and_message() {
        let error = DesktopError::new("spawn_failed", "Failed to start desktop backend.");

        assert_eq!(error.to_string(), "Failed to start desktop backend. (spawn_failed)");
    }

    #[test]
    fn backend_error_payload_from_node_carries_its_code_through_unchanged() {
        let payload = BackendErrorPayload {
            code: "provider_unreachable".to_string(),
            message: "fetch failed".to_string(),
        };

        let error: DesktopError = payload.into();

        assert_eq!(error.code, "provider_unreachable");
        assert_eq!(error.message, "fetch failed");
    }

    #[test]
    fn keychain_provider_validation_accepts_gemini_and_openai() {
        assert!(validate_keychain_provider("gemini").is_ok());
        assert!(validate_keychain_provider("openai").is_ok());
    }

    #[test]
    fn keychain_provider_validation_rejects_unknown_providers() {
        assert!(validate_keychain_provider("ollama").is_err());
        assert!(validate_keychain_provider("").is_err());
        assert!(validate_keychain_provider("Gemini").is_err());
    }
}
