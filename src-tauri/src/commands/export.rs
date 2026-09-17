// Playlist export: the backend renders the file, this module shows the native save dialog
// and writes the result atomically.

use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs::{create_dir_all, remove_file, rename, write},
    path::Path,
    sync::mpsc,
    time::Instant,
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::backend::*;
use crate::error::*;
use crate::timing::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopExportPayload {
    pub(crate) format: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BackendExportResponse {
    pub(crate) content: String,
    pub(crate) filename: String,
}

pub(crate) fn desktop_export_filter(format: &str) -> (&'static str, &'static [&'static str]) {
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

pub(crate) fn desktop_export_filters(format: &str) -> Vec<(&'static str, &'static [&'static str])> {
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

pub(crate) fn replace_file_contents(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Desktop export path must have a parent directory.".to_string())?;
    create_dir_all(parent)
        .map_err(|error| format!("Failed to create export directory: {error}"))?;

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

pub(crate) fn desktop_export_playlist_impl(
    app: &AppHandle,
    state: &DesktopState,
    payload: Option<Value>,
) -> Result<Value, DesktopError> {
    let timing_id = next_timing_id();
    let started_at = Instant::now();
    let payload_value = payload.ok_or_else(|| {
        DesktopError::new("invalid_payload", "Desktop export payload is missing.")
    })?;
    let export_request: DesktopExportPayload = serde_json::from_value(payload_value.clone())
        .map_err(|error| {
            DesktopError::new(
                "invalid_payload",
                format!("Failed to parse desktop export payload: {error}"),
            )
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
        DesktopError::new(
            "backend_protocol",
            format!("Failed to parse desktop export response: {error}"),
        )
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
        DesktopError::new(
            "export_failed",
            format!("Failed waiting for desktop save dialog: {error}"),
        )
    })?;
    log_timing(
        "desktop_export_dialog",
        "exportPlaylist",
        &timing_id,
        dialog_started,
    );

    let Some(selected_path) = selected_path else {
        log_timing(
            "command_roundtrip",
            "exportPlaylist",
            &timing_id,
            started_at,
        );
        return Ok(json!({ "status": "cancelled" }));
    };

    let path = selected_path.into_path().map_err(|_| {
        DesktopError::new(
            "export_failed",
            "Desktop save dialog returned a non-local path.",
        )
    })?;
    let save_started = Instant::now();
    replace_file_contents(&path, &export_response.content)
        .map_err(|message| DesktopError::new("export_failed", message))?;
    log_timing(
        "desktop_export_save",
        "exportPlaylist",
        &timing_id,
        save_started,
    );
    log_timing(
        "command_roundtrip",
        "exportPlaylist",
        &timing_id,
        started_at,
    );
    Ok(json!({
        "status": "saved",
        "filename": export_response.filename,
        "path": path.to_string_lossy().into_owned()
    }))
}

#[tauri::command]
pub async fn desktop_export_playlist(
    app: AppHandle,
    state: tauri::State<'_, DesktopState>,
    payload: Option<Value>,
) -> Result<Value, DesktopError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        desktop_export_playlist_impl(&app, &state, payload)
    })
    .await
    .map_err(|error| {
        DesktopError::new(
            "spawn_failed",
            format!("Desktop backend task failed: {error}"),
        )
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;
    use std::fs::{create_dir_all, read_to_string, remove_dir_all, write};

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
        let test_dir = unique_temp_dir("cutlist-export-test");
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("playlist.json");
        write(&path, "old").unwrap();

        replace_file_contents(&path, "new").unwrap();

        assert_eq!(read_to_string(&path).unwrap(), "new");
        remove_dir_all(test_dir).unwrap();
    }
}
