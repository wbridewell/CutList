// The CutList desktop shell. Native privilege lives here; the product logic runs in the
// trusted Node backend that backend.rs spawns per command. Module map:
//   runtime.rs   locate and validate the backend runtime, inject secrets and .env.local
//   backend.rs   spawn the backend for a command, stream progress, cancel
//   commands/    native-only commands: export, keychain, workspace file, shell
//   error.rs     the {code, message} error every command returns
//   secrets.rs   keyring access; desktop_log.rs  redacted app-data log
mod backend;
mod commands;
mod desktop_log;
mod error;
mod runtime;
mod secrets;
mod test_support;
mod timing;

use backend::DesktopState;
use commands::keychain::migrate_plaintext_provider_keys_to_keychain;
use runtime::{show_packaged_runtime_error, validate_packaged_runtime};

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
            backend::desktop_analyze_playlist,
            backend::desktop_cancel_request,
            commands::keychain::desktop_delete_provider_secret,
            commands::export::desktop_export_playlist,
            backend::desktop_get_llm_setup,
            commands::shell::desktop_get_log_path,
            commands::workspace::desktop_get_workspace_state,
            backend::desktop_import_chat,
            commands::shell::desktop_open_external_url,
            backend::desktop_plan_user_request,
            backend::desktop_playlist_message,
            commands::workspace::desktop_quarantine_workspace_state,
            commands::shell::desktop_quit,
            commands::shell::desktop_reveal_in_file_manager,
            backend::desktop_save_llm_setup,
            backend::desktop_save_workspace_state,
            commands::keychain::desktop_set_provider_secret,
            backend::desktop_test_llm_setup,
            commands::shell::desktop_toggle_devtools,
            backend::desktop_verify_tracks
        ])
        .run(tauri::generate_context!())
        .expect("error while running The CutList desktop app");
}
