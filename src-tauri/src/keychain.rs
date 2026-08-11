//! OS keychain wrapper for provider-specific API keys.
//!
//! Ponytail: bare `keyring` crate called from inside Tauri commands. We do NOT use
//! `tauri-plugin-keyring` — the command itself is the permission boundary, and D-08
//! forbids ever returning the key to JS. Reads are sub-millisecond on Windows/macOS
//! so we fetch on every LLM call rather than caching (Pitfall 4: stale key after
//! the user updates it).

use crate::error::AppError;
use crate::llm::Provider;

// D-06: service "nova.pm-workspace". Provider keys use the provider name as
// account. ACCOUNT remains for reading the pre-Phase-9 legacy entry.
pub const SERVICE: &str = "nova.pm-workspace";
pub const ACCOUNT: &str = "default";

fn get_key_for_account(account: &str) -> Result<String, AppError> {
    keyring::Entry::new(SERVICE, account)
        .and_then(|entry| entry.get_password())
        .map_err(|error| match error {
            keyring::Error::NoEntry => AppError::AuthError,
            other => AppError::InternalError(format!("keyring get: {}", other)),
        })
}

/// Read a provider key using account = provider name. DeepSeek falls back to
/// the legacy `default` account so existing generate_project users keep working.
pub fn get_provider_key(provider: &Provider) -> Result<String, AppError> {
    match get_key_for_account(provider.key()) {
        Ok(key) => Ok(key),
        Err(AppError::AuthError) if *provider == Provider::DeepSeek => get_key_for_account(ACCOUNT),
        Err(error) => Err(error),
    }
}

pub fn set_provider_key(provider: &Provider, key: &str) -> Result<(), AppError> {
    keyring::Entry::new(SERVICE, provider.key())
        .and_then(|entry| entry.set_password(key))
        .map_err(|error| AppError::InternalError(format!("keyring set: {}", error)))
}

pub fn has_provider_key(provider: &Provider) -> bool {
    get_provider_key(provider).is_ok()
}

pub fn get_api_key() -> Result<String, AppError> {
    get_provider_key(&Provider::DeepSeek)
}

pub fn set_api_key(key: &str) -> Result<(), AppError> {
    set_provider_key(&Provider::DeepSeek, key)
}

pub fn has_api_key() -> bool {
    get_api_key().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Behavior-only: confirm error mapping is correct. We do NOT round-trip a real
    /// credential — Windows Credential Manager propagation timing under cargo test
    /// subprocesses is flaky, and Linux CI without gnome-keyring/kwallet would fail
    /// the assertion entirely. The actual keychain wiring is exercised in
    /// `03-HUMAN-UAT.md` Wave 3 (Settings → save key → reload → still present).
    #[test]
    fn missing_entry_maps_to_autherror_variant() {
        // We don't know whether the dev box has a stored key, so this test asserts
        // the SHAPE of the error mapping only when get_api_key() returns Err.
        if let Err(e) = get_api_key() {
            // NoEntry (or any read failure that returns NoEntry on this platform)
            // must map to AuthError, not InternalError. Other errors stay InternalError.
            match keyring::Entry::new(SERVICE, Provider::DeepSeek.key())
                .and_then(|e| e.get_password())
            {
                Err(keyring::Error::NoEntry) => {
                    assert!(
                        matches!(e, AppError::AuthError),
                        "NoEntry must map to AuthError, got {:?}",
                        e
                    );
                }
                Err(other) => {
                    assert!(
                        matches!(e, AppError::InternalError(_)),
                        "non-NoEntry errors must map to InternalError, got {:?} (src={})",
                        e,
                        other
                    );
                }
                Ok(_) => { /* entry exists; cannot test the missing path here */ }
            }
        }
    }

    /// has_api_key() must agree with get_api_key() — they're the same call,
    /// different return shape. If get returns Ok, has returns true.
    #[test]
    fn has_api_key_matches_get_api_key() {
        let get_result = get_api_key();
        let has_result = has_api_key();
        assert_eq!(
            get_result.is_ok(),
            has_result,
            "has_api_key() must mirror get_api_key().is_ok()"
        );
    }

    /// The service and account constants are the source of truth for the entire
    /// crate (lib.rs LLM flow, frontend adapter docs). Lock them in.
    #[test]
    fn service_and_account_constants() {
        assert_eq!(SERVICE, "nova.pm-workspace");
        assert_eq!(ACCOUNT, "default");
    }

    #[test]
    fn provider_account_names_are_stable() {
        assert_eq!(Provider::DeepSeek.key(), "deepseek");
        assert_eq!(Provider::OpenAI.key(), "openai");
        assert_eq!(Provider::Anthropic.key(), "anthropic");
        assert_eq!(Provider::Gemini.key(), "gemini");
        assert_eq!(Provider::Ollama.key(), "ollama");
    }
}
