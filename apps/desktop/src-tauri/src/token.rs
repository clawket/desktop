//! Token reader for the daemon TCP auth header.
//!
//! The daemon writes its rotating session token to
//! `${XDG_CACHE_HOME:-$HOME/.cache}/clawket/clawketd.token` on startup. The
//! middleware accepts it as the value of the `X-Clawket-Token` header (see
//! `daemon/src/middleware/tcp_auth.rs`). The Unix-socket path is auth-exempt,
//! but the renderer (a browser-style frontend) talks over TCP, so it must
//! present this token on every request.
//!
//! Resolution order mirrors `daemon::paths::cache_dir`:
//!   1. `CLAWKET_CACHE_DIR` (full cache root)
//!   2. `XDG_CACHE_HOME` + `clawket/`
//!   3. `$HOME/.cache/clawket/`

use std::path::PathBuf;

const TOKEN_FILE: &str = "clawketd.token";

pub fn default_token_path() -> PathBuf {
    if let Some(p) = std::env::var_os("CLAWKET_CACHE_DIR") {
        let dir: PathBuf = p.into();
        if !dir.as_os_str().is_empty() {
            return dir.join(TOKEN_FILE);
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let xdg = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".cache"));
    xdg.join("clawket").join(TOKEN_FILE)
}

/// Read the daemon's session token. Trims trailing whitespace / newlines.
///
/// Errors as a String so it serialises cleanly back to the renderer over the
/// Tauri command bridge.
#[tauri::command]
pub fn read_token() -> Result<String, String> {
    let path = default_token_path();
    match std::fs::read_to_string(&path) {
        Ok(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                Err(format!("token file is empty: {}", path.display()))
            } else {
                Ok(trimmed)
            }
        }
        Err(e) => Err(format!(
            "failed to read token at {}: {e}",
            path.display()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_path_uses_xdg() {
        let p = default_token_path();
        assert!(p.to_string_lossy().ends_with("clawket/clawketd.token"));
    }
}
