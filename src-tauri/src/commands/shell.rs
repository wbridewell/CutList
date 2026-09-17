// Native-shell commands: reveal in Finder, open allowlisted project links, developer
// tools, quit, and the log path.

use serde_json::{json, Value};
use std::{path::PathBuf, process::Command};
use tauri::AppHandle;

use crate::desktop_log::ensure_log_file;

#[tauri::command]
pub fn desktop_reveal_in_file_manager(path: String) -> Result<Value, String> {
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

// The webview deliberately has no opener plugin: `window.open` on an external URL is
// either swallowed by the CSP or navigates the app away. This command opens only the
// project's own GitHub pages in the system browser, which is narrower than a general
// opener and keeps the capability file unchanged.
pub(crate) const EXTERNAL_URL_ALLOWED_PREFIXES: [&str; 1] =
    ["https://github.com/wbridewell/CutList"];

pub(crate) fn validate_external_url(url: &str) -> Result<(), String> {
    let safe_chars = url.chars().all(|character| {
        character.is_ascii_alphanumeric() || "-._~:/?#[]@!$'()*+,;=%".contains(character)
    });
    if url.is_empty() || !safe_chars {
        return Err("External URL contains characters that are not allowed.".to_string());
    }
    let allowed = EXTERNAL_URL_ALLOWED_PREFIXES.iter().any(|prefix| {
        url == *prefix
            || url.strip_prefix(prefix).is_some_and(|rest| {
                rest.starts_with('/') || rest.starts_with('#') || rest.starts_with('?')
            })
    });
    if allowed {
        Ok(())
    } else {
        Err("External URL is not on the allowlist.".to_string())
    }
}

#[tauri::command]
pub fn desktop_open_external_url(url: String) -> Result<Value, String> {
    validate_external_url(&url)?;
    let mut command = if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(&url);
        command
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &url]);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(&url);
        command
    };
    let status = command
        .status()
        .map_err(|error| format!("Failed to open the link in the system browser: {error}"))?;
    if !status.success() {
        return Err("The system browser could not open the link.".to_string());
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn desktop_toggle_devtools(window: tauri::WebviewWindow) -> Result<Value, String> {
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
        Ok(json!({ "ok": true }))
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err("Developer tools are only available in development builds.".to_string())
    }
}

// Replaces the predefined Quit menu item so the webview can flush autosave before exit.
#[tauri::command]
pub fn desktop_quit(app: AppHandle) -> Result<Value, String> {
    app.exit(0);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn desktop_get_log_path(app: AppHandle) -> Result<Value, String> {
    let path = ensure_log_file(&app)?;
    Ok(json!({ "path": path.to_string_lossy() }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn external_url_allowlist_accepts_the_help_and_issue_links() {
        assert!(
            super::validate_external_url("https://github.com/wbridewell/CutList#readme").is_ok()
        );
        assert!(
            super::validate_external_url("https://github.com/wbridewell/CutList/issues/new")
                .is_ok()
        );
        assert!(super::validate_external_url("https://github.com/wbridewell/CutList").is_ok());
    }

    #[test]
    fn external_url_allowlist_rejects_other_destinations() {
        for url in [
            "http://github.com/wbridewell/CutList",
            "https://github.com/wbridewell/CutList.evil/x",
            "https://github.com/wbridewell/CutListing",
            "https://github.com/someone-else/CutList",
            "https://example.com/?next=https://github.com/wbridewell/CutList",
            "javascript:alert(1)",
            "https://github.com/wbridewell/CutList/issues new",
            "https://github.com/wbridewell/CutList/issues?a=1&b=2",
            "",
        ] {
            assert!(
                super::validate_external_url(url).is_err(),
                "should reject {url:?}"
            );
        }
    }
}
