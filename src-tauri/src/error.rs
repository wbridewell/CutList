// The error shape every desktop command returns to the webview. See DesktopErrorCode in
// src/lib/desktop/contracts.ts for the code vocabulary.

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub(crate) struct BackendErrorPayload {
    pub(crate) code: String,
    pub(crate) message: String,
}

// The error type returned from every Tauri command that talks to the Node backend.
// `code` is one of the DesktopErrorCode values defined in src/lib/desktop/contracts.ts;
// Rust either classifies its own failures (spawn/protocol/runtime) or passes through
// whatever code the Node backend already classified in desktop/command.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopError {
    pub(crate) code: String,
    pub(crate) message: String,
}

impl DesktopError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
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

#[cfg(test)]
mod tests {
    use super::*;

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

        assert_eq!(
            error.to_string(),
            "Failed to start desktop backend. (spawn_failed)"
        );
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
}
