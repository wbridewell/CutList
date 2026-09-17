use regex::{Captures, Regex};
use std::{
    fs::{create_dir_all, metadata, remove_file, rename, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

fn secret_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            // Each pattern captures the part that is safe to keep in group 1 (a
            // recognizable prefix or the key name/separator) so the replacement can
            // show what kind of value was redacted without keeping the secret itself.
            Regex::new(r"(sk-)[A-Za-z0-9_-]{16,}").expect("valid sk- secret pattern"),
            Regex::new(r"(AIza)[A-Za-z0-9_-]{20,}").expect("valid AIza secret pattern"),
            // The value side intentionally allows whitespace so a scheme-prefixed value
            // like `Authorization: Bearer <token>` is redacted in full instead of only
            // consuming the scheme word and leaving the token itself exposed after it.
            Regex::new(r#"(?i)((?:"?api[_-]?key"?|"?authorization"?|"?x-goog-api-key"?)\s*[:=]\s*"?)[^"\r\n,}&]+"#)
                .expect("valid key-value secret pattern"),
        ]
    })
}

pub fn redact_secrets(input: &str) -> String {
    let mut result = input.to_string();
    for pattern in secret_patterns() {
        result = pattern
            .replace_all(&result, |caps: &Captures| format!("{}[REDACTED]", &caps[1]))
            .into_owned();
    }
    result
}

pub fn resolve_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit_path) = std::env::var("CUTLIST_DESKTOP_LOG_PATH") {
        return Ok(PathBuf::from(explicit_path));
    }

    if cfg!(debug_assertions) {
        return Ok(crate::runtime::project_root()
            .join(".cutlist-desktop-data")
            .join("logs")
            .join("cutlist.log"));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(app_data_dir.join("logs").join("cutlist.log"))
}

pub fn ensure_log_file(app: &AppHandle) -> Result<PathBuf, String> {
    let path = resolve_log_path(app)?;
    if let Some(parent) = path.parent() {
        create_dir_all(parent)
            .map_err(|error| format!("Failed to create log directory: {error}"))?;
    }
    if !path.exists() {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("Failed to create log file: {error}"))?;
    }
    Ok(path)
}

fn timestamp_prefix() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("[t={seconds}]")
}

// Rotates the log file to a single `.1` backup once it would grow past MAX_LOG_BYTES,
// so a long-running app never accumulates an unbounded log on disk.
fn rotate_and_append(path: &Path, line: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent)
            .map_err(|error| format!("Failed to create log directory: {error}"))?;
    }

    if let Ok(existing) = metadata(path) {
        if existing.len() + line.len() as u64 + 1 > MAX_LOG_BYTES {
            let rotated_path = path.with_extension("log.1");
            let _ = remove_file(&rotated_path);
            rename(path, &rotated_path)
                .map_err(|error| format!("Failed to rotate log file: {error}"))?;
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Failed to open log file: {error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("Failed to write log line: {error}"))?;
    Ok(())
}

// Best-effort: a failure to log should never take down a desktop command.
pub fn append_log_line(app: &AppHandle, message: &str) {
    let Ok(path) = resolve_log_path(app) else {
        return;
    };
    let line = format!("{} {}", timestamp_prefix(), redact_secrets(message));
    let _ = rotate_and_append(&path, &line);
}

#[cfg(test)]
mod tests {
    use super::{redact_secrets, rotate_and_append, MAX_LOG_BYTES};
    use std::{
        fs::{create_dir_all, read_to_string, remove_dir_all, write},
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "{prefix}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn redacts_openai_style_secret_keys() {
        let input = "Incorrect API key provided: sk-proj-AbCdEfGh12345678901234567890.";
        let redacted = redact_secrets(input);
        assert!(redacted.contains("sk-[REDACTED]"));
        assert!(!redacted.contains("AbCdEfGh12345678901234567890"));
    }

    #[test]
    fn redacts_gemini_style_secret_keys() {
        let input = "fetch failed for https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=AIzaSyD1234567890abcdefghijklmno";
        let redacted = redact_secrets(input);
        assert!(redacted.contains("AIza[REDACTED]"));
        assert!(!redacted.contains("D1234567890abcdefghijklmno"));
    }

    #[test]
    fn redacts_api_key_fields_in_json_style_payloads() {
        let input = r#"request failed: {"apiKey":"AIzaSyD1234567890abcdefghijklmno","model":"gemini-2.5-flash"}"#;
        let redacted = redact_secrets(input);
        assert!(!redacted.contains("D1234567890abcdefghijklmno"));
        assert!(redacted.contains("\"model\":\"gemini-2.5-flash\""));
    }

    #[test]
    fn redacts_authorization_header_values_case_insensitively() {
        let input = "authorization: sk-abcdefghijklmnopqrstuvwxyz123456";
        let redacted = redact_secrets(input);
        assert!(!redacted.contains("abcdefghijklmnopqrstuvwxyz123456"));
    }

    #[test]
    fn redacts_the_full_bearer_token_not_just_the_scheme_word() {
        let input = "request failed: Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
        let redacted = redact_secrets(input);
        assert!(!redacted.contains("abcdefghijklmnopqrstuvwxyz123456"));
        assert!(!redacted.contains("Bearer"));
        assert!(redacted.contains("[REDACTED]"));
    }

    #[test]
    fn leaves_unrelated_text_untouched() {
        let input = "The model took too long to respond after 120000ms.";
        assert_eq!(redact_secrets(input), input);
    }

    #[test]
    fn does_not_redact_short_tokens_that_only_resemble_a_secret_prefix() {
        let input = "the setting sk-ip was renamed";
        assert_eq!(redact_secrets(input), input);
    }

    #[test]
    fn rotate_and_append_appends_under_the_size_threshold() {
        let test_dir = unique_temp_dir("cutlist-log-append");
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("cutlist.log");

        rotate_and_append(&path, "first line").unwrap();
        rotate_and_append(&path, "second line").unwrap();

        let contents = read_to_string(&path).unwrap();
        assert!(contents.contains("first line"));
        assert!(contents.contains("second line"));
        assert!(!test_dir.join("cutlist.log.1").exists());

        remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn rotate_and_append_rotates_once_the_file_would_exceed_the_limit() {
        let test_dir = unique_temp_dir("cutlist-log-rotate");
        create_dir_all(&test_dir).unwrap();
        let path = test_dir.join("cutlist.log");
        write(&path, "x".repeat(MAX_LOG_BYTES as usize)).unwrap();

        rotate_and_append(&path, "line after rotation").unwrap();

        let rotated_path = test_dir.join("cutlist.log.1");
        assert!(rotated_path.exists());
        assert_eq!(
            read_to_string(&rotated_path).unwrap().len(),
            MAX_LOG_BYTES as usize
        );
        let contents = read_to_string(&path).unwrap();
        assert!(contents.contains("line after rotation"));
        assert!(!contents.contains('x'));

        remove_dir_all(test_dir).unwrap();
    }
}
