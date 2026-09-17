// Provider API keys in the OS keychain, plus the one-time migration of plaintext keys out
// of the local settings file. Keys never travel back to the webview.

use serde_json::{json, Value};
use std::{
    fs::{read_to_string, write},
    path::PathBuf,
};
use tauri::{AppHandle, Manager};

use crate::secrets;

use crate::runtime::*;

// Mirrors llmConfig.ts's settingsPath() resolution so this runs against the same file
// Node reads/writes. Node owns the schema for this file; this function only ever touches
// the two provider-key fields, leaving every other field untouched.
pub(crate) fn local_llm_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        return Ok(project_root()
            .join(".cutlist-desktop-data")
            .join(".cutlist.local-settings.json"));
    }

    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join(".cutlist.local-settings.json"))
}

pub(crate) const PLAINTEXT_PROVIDER_KEY_FIELDS: [(&str, &str); 2] =
    [("gemini", "geminiApiKey"), ("openai", "openaiApiKey")];

// Removes plaintext provider keys from a parsed settings object once `store` has taken
// ownership of them. `store` must return true only after the secret can be read back, so
// a key is never deleted from the file while the keychain is unable to return it; a blank
// value is simply dropped. Returns true when the object changed.
pub(crate) fn strip_plaintext_provider_keys(
    object: &mut serde_json::Map<String, Value>,
    store: &mut dyn FnMut(&str, &str) -> bool,
) -> bool {
    let mut changed = false;
    for (provider, field) in PLAINTEXT_PROVIDER_KEY_FIELDS {
        let secret = match object.get(field) {
            Some(Value::String(secret)) => secret.clone(),
            _ => continue,
        };
        if !secret.trim().is_empty() && !store(provider, &secret) {
            continue;
        }
        object.remove(field);
        changed = true;
    }
    changed
}

// One-time, idempotent: moves any plaintext provider API keys already sitting in the
// local settings file (from before keychain storage existed) into the OS keychain, then
// rewrites the file with those two fields removed. Best-effort by design — a failure
// here should never block app startup, so every error is swallowed rather than surfaced.
pub(crate) fn migrate_plaintext_provider_keys_to_keychain(app: &AppHandle) {
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

    let changed =
        strip_plaintext_provider_keys(object, &mut secrets::store_provider_secret_verified);

    if changed {
        if let Ok(serialized) = serde_json::to_string_pretty(&value) {
            let _ = write(&path, format!("{serialized}\n"));
        }
    }
}

pub(crate) fn validate_keychain_provider(provider: &str) -> Result<(), String> {
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
pub fn desktop_set_provider_secret(provider: String, secret: String) -> Result<Value, String> {
    validate_keychain_provider(&provider)?;
    secrets::set_provider_secret(&provider, &secret)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn desktop_delete_provider_secret(provider: String) -> Result<Value, String> {
    validate_keychain_provider(&provider)?;
    secrets::delete_provider_secret(&provider)?;
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn settings_object(value: serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn migration_strips_plaintext_keys_only_after_the_store_reads_them_back() {
        let mut object = settings_object(json!({
            "provider": "gemini",
            "geminiApiKey": "AIza-migrate-me",
            "openaiApiKey": "sk-migrate-me"
        }));
        let mut stored = Vec::new();

        let changed = strip_plaintext_provider_keys(&mut object, &mut |provider, secret| {
            stored.push((provider.to_string(), secret.to_string()));
            true
        });

        assert!(changed);
        assert!(!object.contains_key("geminiApiKey"));
        assert!(!object.contains_key("openaiApiKey"));
        assert_eq!(object["provider"], "gemini");
        assert_eq!(
            stored,
            vec![
                ("gemini".to_string(), "AIza-migrate-me".to_string()),
                ("openai".to_string(), "sk-migrate-me".to_string())
            ]
        );
    }

    #[test]
    fn migration_keeps_the_plaintext_key_when_the_store_cannot_read_it_back() {
        let mut object = settings_object(json!({ "geminiApiKey": "AIza-keep-me" }));

        let changed = strip_plaintext_provider_keys(&mut object, &mut |_, _| false);

        assert!(!changed);
        assert_eq!(object["geminiApiKey"], "AIza-keep-me");
    }

    #[test]
    fn migration_drops_blank_plaintext_keys_without_storing_them() {
        let mut object = settings_object(json!({ "openaiApiKey": "   " }));
        let mut store_calls = 0;

        let changed = strip_plaintext_provider_keys(&mut object, &mut |_, _| {
            store_calls += 1;
            true
        });

        assert!(changed);
        assert_eq!(store_calls, 0);
        assert!(!object.contains_key("openaiApiKey"));
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
