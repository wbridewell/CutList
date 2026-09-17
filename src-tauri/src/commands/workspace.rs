// Direct reads of the workspace file, bypassing the Node backend so first launch is fast,
// and quarantine of a file the client finds unreadable or schema-invalid.

use serde_json::{json, Value};
use std::{
    fs::{read_to_string, rename},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

use crate::runtime::*;

pub(crate) fn desktop_workspace_state_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        return Ok(project_root()
            .join(".cutlist-desktop-data")
            .join("workspace-state.json"));
    }

    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("workspace-state.json"))
}

pub(crate) fn quarantine_workspace_file(path: &Path) -> Result<PathBuf, String> {
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
pub fn desktop_get_workspace_state(app: AppHandle) -> Result<Value, String> {
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
pub fn desktop_quarantine_workspace_state(app: AppHandle) -> Result<Value, String> {
    let path = desktop_workspace_state_path(&app)?;
    if !path.exists() {
        return Ok(json!({ "recoveredPath": null }));
    }
    let quarantine_path = quarantine_workspace_file(&path)?;
    Ok(json!({ "recoveredPath": quarantine_path.to_string_lossy() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;
    use std::fs::{create_dir_all, read_to_string, remove_dir_all, write};

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
            .is_some_and(
                |name| name.starts_with("workspace-state.damaged-") && name.ends_with(".json")
            ));
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
}
