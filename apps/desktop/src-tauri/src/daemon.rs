//! `clawketd` child-process spawn.
//!
//! Resolution order mirrors `cli/src/daemon_autostart.rs::resolve_daemon_bin`
//! (see `cli/.claude/rules/cli-daemon-bin-resolution-order.md`):
//!   1. `CLAWKET_DAEMON_BIN` env override
//!   2. plugin layout candidates (sibling, daemon/bin/, XDG install)
//!   3. PATH lookup (`clawketd`)
//!
//! We don't depend on the CLI crate to keep `apps/desktop` independent of
//! source-level coupling to `clawket/cli`. The shared invariant is the
//! resolution order and the binary name only.

use std::io;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

const DAEMON_BIN_NAME: &str = "clawketd";

#[derive(Debug)]
pub struct DaemonHandle {
    pub bin: PathBuf,
    pub child: Child,
}

pub fn resolve_daemon_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("CLAWKET_DAEMON_BIN") {
        if !p.is_empty() {
            let path = PathBuf::from(p);
            if path.exists() {
                return Some(path);
            }
        }
    }

    for candidate in candidate_paths() {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // Last-resort: rely on PATH; Command::spawn will look it up itself.
    Some(PathBuf::from(DAEMON_BIN_NAME))
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // sibling: same directory as the Tauri app binary
            out.push(dir.join(DAEMON_BIN_NAME));
            // plugin layout: ../daemon/bin/clawketd (mirrors cli pattern)
            if let Some(parent) = dir.parent() {
                out.push(parent.join("daemon").join("bin").join(DAEMON_BIN_NAME));
            }
        }
    }

    // XDG install
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let xdg_data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"));
    out.push(xdg_data.join("clawket").join("bin").join(DAEMON_BIN_NAME));

    out
}

/// Spawn the daemon as a detached child. Errors are returned, not panicked.
///
/// If `CLAWKET_NO_AUTOSPAWN` is set, this is a no-op (returns Err).
pub fn spawn() -> io::Result<DaemonHandle> {
    if std::env::var("CLAWKET_NO_AUTOSPAWN")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
    {
        return Err(io::Error::other("CLAWKET_NO_AUTOSPAWN is set"));
    }

    let bin = resolve_daemon_bin().ok_or_else(|| {
        io::Error::new(io::ErrorKind::NotFound, "no daemon binary candidate")
    })?;

    let child = Command::new(&bin)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    Ok(DaemonHandle { bin, child })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_returns_some_fallback_when_nothing_exists() {
        // Even with no candidates, we fall back to bare binary name for PATH.
        let resolved = resolve_daemon_bin();
        assert!(resolved.is_some());
    }
}
