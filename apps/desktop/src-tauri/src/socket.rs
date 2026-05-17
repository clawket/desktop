//! Minimal Unix-socket HTTP client for talking to `clawketd`.
//!
//! Mirrors the CLI invariant: socket-only, no TCP fallback, no token loading.
//! See `clawket/cli/.claude/rules/cli-unix-socket-only-no-tcp-fallback.md`.

use std::io;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tokio::time::{Duration, timeout};

const READ_BUF_CAP: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug)]
pub struct PingResponse {
    pub status: u16,
    pub body: String,
}

/// Default Unix socket path (XDG cache). Mirrors `cli/src/paths.rs::socket_path`.
pub fn default_socket_path() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let xdg = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".cache"));
    xdg.join("clawket").join("clawketd.sock")
}

/// Send `GET /health HTTP/1.1` over the daemon Unix socket.
pub async fn ping_health(socket: &Path) -> io::Result<PingResponse> {
    let fut = async {
        let mut stream = UnixStream::connect(socket).await?;
        let req = b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        stream.write_all(req).await?;
        stream.flush().await?;

        let mut buf = Vec::with_capacity(2048);
        let mut chunk = [0u8; 4096];
        loop {
            if buf.len() >= READ_BUF_CAP {
                break;
            }
            let n = stream.read(&mut chunk).await?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
        }
        parse_response(&buf)
    };

    match timeout(REQUEST_TIMEOUT, fut).await {
        Ok(res) => res,
        Err(_) => Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "clawketd /health timed out",
        )),
    }
}

fn parse_response(raw: &[u8]) -> io::Result<PingResponse> {
    let s = std::str::from_utf8(raw)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "non-utf8 response"))?;
    let (head, body) = s
        .split_once("\r\n\r\n")
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "no header terminator"))?;
    let status_line = head
        .lines()
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "empty response"))?;
    let mut parts = status_line.splitn(3, ' ');
    let _ver = parts.next();
    let status = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing status"))?
        .parse::<u16>()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "bad status code"))?;

    // Strip transfer-encoding: chunked size marker if present (clawketd uses
    // Content-Length so this is usually a no-op; defensive only).
    let body_clean = body.trim_start_matches(|c: char| c.is_ascii_hexdigit() || c == '\r' || c == '\n');
    Ok(PingResponse {
        status,
        body: body_clean.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_response() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 9\r\n\r\n{\"ok\":1}";
        let resp = parse_response(raw).unwrap();
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("\"ok\""));
    }

    #[test]
    fn parse_404() {
        let raw = b"HTTP/1.1 404 Not Found\r\n\r\n";
        let resp = parse_response(raw).unwrap();
        assert_eq!(resp.status, 404);
    }

    #[test]
    fn default_socket_uses_xdg() {
        let path = default_socket_path();
        assert!(path.to_string_lossy().ends_with("clawket/clawketd.sock"));
    }
}
