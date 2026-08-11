//! Phase 3 AppError enum + manual serde::Serialize (RESEARCH.md §Pattern 4).
//!
//! Ponytail: bare `serialize_str` is one line. JS reads the error as a string and
//! thiserror's Display already prepends a variant-prefixed message. The frontend's
//! `src/lib/api.ts` adapter wraps every IPC error as `Promise<T>` rejection with
//! `.message`, and D-14 maps human-readable messages for the toast — branch-on-variant
//! in JS is YAGNI for one migrated endpoint.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("network error: {0}")]
    NetworkError(String),
    #[error("invalid api key")]
    AuthError,
    #[error("parse error: {0}")]
    ParseError(String),
    #[error("cancelled")]
    Cancelled,
    #[error("internal error: {0}")]
    InternalError(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apperror_serializes_as_json_string() {
        // The frontend reads `err` as a string in invoke rejection. Confirm every
        // variant serializes to a quoted JSON string with a non-empty message.
        let cases: Vec<(AppError, &str)> = vec![
            (
                AppError::NetworkError("upstream timeout".into()),
                "\"network error: upstream timeout\"",
            ),
            (AppError::AuthError, "\"invalid api key\""),
            (
                AppError::ParseError("bad json".into()),
                "\"parse error: bad json\"",
            ),
            (AppError::Cancelled, "\"cancelled\""),
            (
                AppError::InternalError("oops".into()),
                "\"internal error: oops\"",
            ),
        ];

        for (err, expected) in cases {
            let json = serde_json::to_string(&err).expect("serialize AppError");
            assert_eq!(json, expected, "variant {:?}", err);
        }
    }

    #[test]
    fn apperror_display_is_nonempty_for_every_variant() {
        // Frontend toast falls back to .message; that message must never be empty.
        let samples = [
            AppError::NetworkError("x".into()),
            AppError::AuthError,
            AppError::ParseError("x".into()),
            AppError::Cancelled,
            AppError::InternalError("x".into()),
        ];
        for s in samples {
            assert!(!s.to_string().is_empty());
        }
    }
}
