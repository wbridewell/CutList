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
    time::Instant,
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
    Error { error: String },
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
    if let Err(error) = remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            let _ = remove_file(&temp_path);
            return Err(format!("Failed to replace existing export file: {error}"));
        }
    }
    if let Err(error) = rename(&temp_path, path) {
        let _ = remove_file(&temp_path);
        return Err(format!("Failed to move export file into place: {error}"));
    }
    Ok(())
}

fn project_root() -> PathBuf {
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

fn desktop_command_runner(app: &AppHandle) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        return dev_desktop_command_runner();
    }

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
    Ok(command)
}

fn spawn_backend_command(
    app: &AppHandle,
    state: &DesktopState,
    request_id: Option<&str>,
    timing_id: &str,
    envelope: &CommandEnvelope,
) -> Result<(Arc<Mutex<Child>>, ChildStdout), String> {
    let mut command = desktop_command_runner(app)?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env("CUTLIST_TIMING_ID", timing_id);

    let started_at = Instant::now();
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start desktop backend: {error}"))?;

    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Desktop backend stdin is unavailable.".to_string())?;
        let body = serde_json::to_vec(envelope)
            .map_err(|error| format!("Failed to encode desktop command: {error}"))?;
        stdin
            .write_all(&body)
            .map_err(|error| format!("Failed to send desktop command: {error}"))?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Desktop backend stdout is unavailable.".to_string())?;
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
) -> Result<Value, String> {
    let timing_id = next_timing_id();
    let started_at = Instant::now();
    let result = (|| -> Result<Value, String> {
        let (child, stdout) = spawn_backend_command(app, state, request_id, &timing_id, &envelope)?;
        let reader = BufReader::new(stdout);
        let mut final_result: Option<Value> = None;
        let mut backend_error: Option<String> = None;
        let mut saw_backend_line = false;

        for line in reader.lines() {
            let line = line.map_err(|error| format!("Failed reading desktop backend output: {error}"))?;
            if !saw_backend_line {
                saw_backend_line = true;
                log_timing("process_first_output", &envelope.command, &timing_id, started_at);
            }
            let parsed: BackendLine = serde_json::from_str(&line)
                .map_err(|error| format!("Failed to parse desktop backend output: {error}"))?;
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
                    backend_error = Some(error);
                }
            }
        }

        let status = child
            .lock()
            .map_err(|_| "Desktop backend process is unavailable.".to_string())?
            .wait()
            .map_err(|error| format!("Failed waiting on desktop backend: {error}"))?;

        let was_cancelled = request_id
            .map(|value| finish_request(state, value))
            .unwrap_or(false);
        if was_cancelled {
            return Err("Request interrupted.".to_string());
        }
        if let Some(error) = backend_error {
            return Err(error);
        }
        if !status.success() {
            return Err(format!("Desktop backend exited with status {status}."));
        }

        final_result.ok_or_else(|| "Desktop backend did not return a result.".to_string())
    })();

    log_timing("command_roundtrip", &envelope.command, &timing_id, started_at);
    result
}

#[tauri::command]
async fn desktop_playlist_message(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
    request_id: String,
    payload: Value,
) -> Result<Value, String> {
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
    .map_err(|error| format!("Desktop backend task failed: {error}"))?
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
) -> Result<Value, String> {
    let timing_id = next_timing_id();
    let started_at = Instant::now();
    let payload_value = payload.ok_or_else(|| "Desktop export payload is missing.".to_string())?;
    let export_request: DesktopExportPayload = serde_json::from_value(payload_value.clone())
        .map_err(|error| format!("Failed to parse desktop export payload: {error}"))?;
    let export_response = serde_json::from_value::<BackendExportResponse>(run_backend_command(
        app,
        state,
        None,
        CommandEnvelope {
            command: "exportPlaylist".to_string(),
            payload: Some(payload_value.clone()),
        },
    )?)
    .map_err(|error| format!("Failed to parse desktop export response: {error}"))?;

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
    let selected_path = receiver
        .recv()
        .map_err(|error| format!("Failed waiting for desktop save dialog: {error}"))?;
    log_timing("desktop_export_dialog", "exportPlaylist", &timing_id, dialog_started);

    let Some(selected_path) = selected_path else {
        log_timing("command_roundtrip", "exportPlaylist", &timing_id, started_at);
        return Ok(json!({ "status": "cancelled" }));
    };

    let path = selected_path
        .into_path()
        .map_err(|_| "Desktop save dialog returned a non-local path.".to_string())?;
    let save_started = Instant::now();
    replace_file_contents(&path, &export_response.content)?;
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
fn desktop_get_workspace_state(app: AppHandle) -> Result<Value, String> {
    let path = desktop_workspace_state_path(&app)?;
    let state = match read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("Failed to read workspace state: {error}")),
    };
    Ok(json!({ "state": state }))
}

macro_rules! desktop_value_command {
    ($name:ident, $command:literal) => {
        #[tauri::command]
        async fn $name(
            app: AppHandle,
            state: tauri::State<'_, DesktopState>,
            payload: Option<Value>,
        ) -> Result<Value, String> {
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
            .map_err(|error| format!("Desktop backend task failed: {error}"))?
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
) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || desktop_export_playlist_impl(&app, &state, payload))
        .await
        .map_err(|error| format!("Desktop backend task failed: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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
            desktop_export_playlist,
            desktop_get_llm_setup,
            desktop_get_workspace_state,
            desktop_import_chat,
            desktop_plan_user_request,
            desktop_playlist_message,
            desktop_reveal_in_file_manager,
            desktop_save_llm_setup,
            desktop_save_workspace_state,
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
        replace_file_contents, validate_packaged_runtime_dir,
    };
    use std::{
        fs::{create_dir_all, read_to_string, remove_dir_all, write},
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

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
}
