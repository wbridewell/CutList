// Locating and validating the trusted Node backend runtime: the source-based runner in
// development, the bundled runtime in packaged builds, .env.local handling, and keychain
// secret injection into the backend child's environment.

use std::{
    fs::{create_dir_all, metadata, read_to_string},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use crate::secrets;

pub(crate) fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

// Minimal KEY=VALUE parser for .env.local: comments, blank lines, an optional `export `
// prefix, and matching single or double quotes around the value. No interpolation.
pub(crate) fn parse_dotenv(contents: &str) -> Vec<(String, String)> {
    contents
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
            let (key, value) = line.split_once('=')?;
            let key = key.trim();
            let valid_key = !key.is_empty()
                && key
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
                && !key.starts_with(|character: char| character.is_ascii_digit());
            if !valid_key {
                return None;
            }
            let value = value.trim();
            let value = match (value.chars().next(), value.chars().last()) {
                (Some('"'), Some('"')) | (Some('\''), Some('\'')) if value.len() >= 2 => {
                    &value[1..value.len() - 1]
                }
                _ => value,
            };
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

// Development builds read .env.local from the project root so the documented LLM_* and
// CUTLIST_* overrides reach the backend child. A variable already set to a non-blank
// value in the shell that launched `npm run dev` wins, matching how Next treats the file.
// Packaged builds never read it: testers configure everything through LLM setup.
pub(crate) fn dev_env_overrides() -> Vec<(String, String)> {
    let Ok(contents) = read_to_string(project_root().join(".env.local")) else {
        return Vec::new();
    };
    parse_dotenv(&contents)
}

pub(crate) fn dotenv_entries_to_apply(
    dotenv: &[(String, String)],
    process_value: &dyn Fn(&str) -> Option<String>,
) -> Vec<(String, String)> {
    dotenv
        .iter()
        .filter(|(key, _)| process_value(key).is_none_or(|value| value.trim().is_empty()))
        .cloned()
        .collect()
}

pub(crate) fn dev_desktop_command_runner() -> Result<Command, String> {
    let root = project_root();
    let mut command = Command::new("node");
    command
        .arg("node_modules/tsx/dist/cli.mjs")
        .arg("desktop/command.ts")
        .current_dir(&root)
        .env("NODE_OPTIONS", "--conditions=react-server")
        .env(
            "CUTLIST_DESKTOP_DATA_DIR",
            root.join(".cutlist-desktop-data"),
        );
    Ok(command)
}

pub(crate) fn bundled_node_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

pub(crate) fn packaged_runtime_missing_error(detail: &str) -> String {
    format!(
        "This copy of The CutList is missing part of its bundled desktop runtime ({detail}). Reinstall the app from the DMG, then try again. If it still fails, report this issue on GitHub."
    )
}

pub(crate) fn packaged_runtime_paths(runtime_dir: &Path) -> (PathBuf, PathBuf) {
    (
        runtime_dir
            .join("node")
            .join(bundled_node_executable_name()),
        runtime_dir.join("app").join("desktop").join("command.js"),
    )
}

pub(crate) fn validate_packaged_runtime_dir(runtime_dir: &Path) -> Result<(), String> {
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
            return Err(packaged_runtime_missing_error(
                "bundled Node runtime permissions",
            ));
        }
    }

    Ok(())
}

pub(crate) fn validate_packaged_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let runtime_dir = app
        .path()
        .resolve(".desktop-runtime", BaseDirectory::Resource)
        .map_err(|_| packaged_runtime_missing_error("runtime folder"))?;
    validate_packaged_runtime_dir(&runtime_dir)?;
    Ok(runtime_dir)
}

pub(crate) fn show_packaged_runtime_error(app: &AppHandle, message: String) {
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

// A genuine shell/`.env.local` override for GEMINI_API_KEY/OPENAI_API_KEY must win over
// whatever is stored in the keychain, so a real inherited value blocks injection here.
pub(crate) fn should_inject_keychain_secret(inherited_env_value: Option<&str>) -> bool {
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
pub(crate) fn inject_keychain_secrets(
    command: &mut Command,
    inherited_value: &dyn Fn(&str) -> Option<String>,
) {
    for provider in secrets::KEYCHAIN_PROVIDERS {
        let (Some(env_var), Some(marker)) = (
            secrets::env_var_name_for(provider),
            secrets::key_source_marker_for(provider),
        ) else {
            continue;
        };
        if !should_inject_keychain_secret(inherited_value(env_var).as_deref()) {
            continue;
        }
        if let Some(secret) = secrets::get_provider_secret(provider) {
            command.env(env_var, secret).env(marker, "1");
        }
    }
}

pub(crate) fn desktop_command_runner(app: &AppHandle) -> Result<Command, String> {
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

        let mut command = Command::new(
            runtime_dir
                .join("node")
                .join(bundled_node_executable_name()),
        );
        command
            .arg(runtime_dir.join("app").join("desktop").join("command.js"))
            .current_dir(runtime_dir.join("app"))
            .env("NODE_OPTIONS", "--conditions=react-server")
            .env("CUTLIST_DESKTOP_DATA_DIR", app_data_dir);
        command
    };

    let dotenv = if cfg!(debug_assertions) {
        dotenv_entries_to_apply(&dev_env_overrides(), &|key| std::env::var(key).ok())
    } else {
        Vec::new()
    };
    for (key, value) in &dotenv {
        command.env(key, value);
    }
    // A key from the shell or .env.local counts as a genuine override, so the keychain
    // value is only injected when neither supplies one.
    inject_keychain_secrets(&mut command, &|name| {
        std::env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                dotenv
                    .iter()
                    .find(|(key, _)| key == name)
                    .map(|(_, value)| value.clone())
            })
    });
    // tauri.conf.json reads the version from package.json; passing it down means the
    // backend (MusicBrainz User-Agent, for one) can never carry a stale hardcoded copy.
    command.env(
        "CUTLIST_APP_VERSION",
        app.package_info().version.to_string(),
    );
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;
    use std::{
        fs::{create_dir_all, remove_dir_all},
        path::Path,
    };

    // tauri.conf.json takes its version from package.json, but Cargo.toml still carries its
    // own copy. Keep them equal so `cargo --version`-style metadata and the bundle agree.
    #[test]
    fn cargo_package_version_matches_package_json() {
        let package_json: serde_json::Value =
            serde_json::from_str(include_str!("../../package.json")).unwrap();
        assert_eq!(
            package_json["version"],
            env!("CARGO_PKG_VERSION"),
            "src-tauri/Cargo.toml version must match package.json"
        );
    }

    #[test]
    fn dotenv_parser_handles_comments_quotes_and_export_prefix() {
        let parsed = super::parse_dotenv(
            "# comment\n\nLLM_PROVIDER=ollama\nexport OLLAMA_MODEL=\"granite4.1:8b\"\nLLM_TIMEOUT_MS='180000'\nEMPTY=\nnot a pair\n9BAD=x\n",
        );
        assert_eq!(
            parsed,
            vec![
                ("LLM_PROVIDER".to_string(), "ollama".to_string()),
                ("OLLAMA_MODEL".to_string(), "granite4.1:8b".to_string()),
                ("LLM_TIMEOUT_MS".to_string(), "180000".to_string()),
                ("EMPTY".to_string(), String::new()),
            ]
        );
    }

    #[test]
    fn dotenv_entries_do_not_override_a_non_blank_process_variable() {
        let dotenv = vec![
            ("LLM_PROVIDER".to_string(), "ollama".to_string()),
            (
                "GEMINI_MODEL".to_string(),
                "gemini-2.5-flash-lite".to_string(),
            ),
            ("LLM_DEBUG_RAW".to_string(), "1".to_string()),
        ];
        let applied = super::dotenv_entries_to_apply(&dotenv, &|key| match key {
            "LLM_PROVIDER" => Some("gemini".to_string()),
            "GEMINI_MODEL" => Some("   ".to_string()),
            _ => None,
        });
        assert_eq!(
            applied,
            vec![
                (
                    "GEMINI_MODEL".to_string(),
                    "gemini-2.5-flash-lite".to_string()
                ),
                ("LLM_DEBUG_RAW".to_string(), "1".to_string()),
            ]
        );
    }

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
    fn packaged_runtime_error_mentions_dmg_reinstall() {
        let message = packaged_runtime_missing_error("bundled Node runtime");
        assert!(message.contains("Reinstall the app from the DMG"));
        assert!(message.contains("report this issue on GitHub"));
    }

    #[test]
    fn packaged_runtime_validation_rejects_missing_runtime_folder() {
        let error = validate_packaged_runtime_dir(Path::new("/definitely/missing/cutlist-runtime"))
            .unwrap_err();
        assert!(error.contains("runtime folder"));
        assert!(error.contains("Reinstall the app from the DMG"));
    }

    #[cfg(unix)]
    #[test]
    fn packaged_runtime_validation_rejects_missing_backend_files() {
        let runtime_dir = unique_temp_dir("cutlist-runtime-check");
        create_dir_all(runtime_dir.join("node")).unwrap();
        write_executable(
            &runtime_dir.join("node").join("node"),
            "#!/bin/sh\nexit 0\n",
        );

        let error = validate_packaged_runtime_dir(&runtime_dir).unwrap_err();
        assert!(error.contains("desktop backend command"));

        remove_dir_all(runtime_dir).unwrap();
    }
}
