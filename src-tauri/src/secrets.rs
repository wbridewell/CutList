use keyring::Entry;

// A single service namespace holds one entry per cloud provider. The identifier matches
// the Tauri bundle identifier so multiple CutList installs (e.g. dev vs release) don't
// collide with unrelated apps in the same keychain.
const SERVICE_NAME: &str = "com.willbridewell.cutlist";

pub const KEYCHAIN_PROVIDERS: [&str; 2] = ["gemini", "openai"];

fn entry_for(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, &format!("llm-provider-key-{provider}"))
        .map_err(|error| format!("Failed to access the system keychain: {error}"))
}

pub fn set_provider_secret(provider: &str, secret: &str) -> Result<(), String> {
    entry_for(provider)?
        .set_password(secret)
        .map_err(|error| format!("Failed to save the key to the system keychain: {error}"))
}

pub fn delete_provider_secret(provider: &str) -> Result<(), String> {
    match entry_for(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to remove the key from the system keychain: {error}")),
    }
}

pub fn get_provider_secret(provider: &str) -> Option<String> {
    entry_for(provider).ok()?.get_password().ok()
}

// Environment variable names desktop_command_runner injects a keychain-stored secret
// under. These match the plaintext env vars the Node backend already reads
// (GEMINI_API_KEY/OPENAI_API_KEY via resolveLLMConfig), plus a source marker per
// provider so the frontend can tell "OS env var override" apart from "keychain" even
// though both arrive as the same underlying env var.
pub fn env_var_name_for(provider: &str) -> Option<&'static str> {
    match provider {
        "gemini" => Some("GEMINI_API_KEY"),
        "openai" => Some("OPENAI_API_KEY"),
        _ => None,
    }
}

pub fn key_source_marker_for(provider: &str) -> Option<&'static str> {
    match provider {
        "gemini" => Some("CUTLIST_GEMINI_KEY_SOURCE"),
        "openai" => Some("CUTLIST_OPENAI_KEY_SOURCE"),
        _ => None,
    }
}

// set_provider_secret/get_provider_secret/delete_provider_secret call the real OS
// keychain and are intentionally not unit tested here: keyring's mock backend is
// installed via a process-wide global (set_default_credential_builder), which would
// leak into every other test in this binary. The lookup tables below are pure and
// safe to test directly; the /keychain scenario is covered by the smoke test checklist
// in docs/MACOS_DMG_ALPHA.md.
#[cfg(test)]
mod tests {
    use super::{env_var_name_for, key_source_marker_for, KEYCHAIN_PROVIDERS};

    #[test]
    fn every_keychain_provider_has_an_env_var_and_marker() {
        for provider in KEYCHAIN_PROVIDERS {
            assert!(env_var_name_for(provider).is_some(), "missing env var mapping for {provider}");
            assert!(key_source_marker_for(provider).is_some(), "missing marker mapping for {provider}");
        }
    }

    #[test]
    fn unknown_providers_map_to_nothing() {
        assert_eq!(env_var_name_for("ollama"), None);
        assert_eq!(key_source_marker_for("ollama"), None);
    }

    #[test]
    fn env_var_names_match_what_resolve_llm_config_reads() {
        assert_eq!(env_var_name_for("gemini"), Some("GEMINI_API_KEY"));
        assert_eq!(env_var_name_for("openai"), Some("OPENAI_API_KEY"));
    }
}
