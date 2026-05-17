//! Integration smoke: if `~/.cache/clawket/clawketd.sock` exists, ping it.
//!
//! Skipped (passes vacuously) when the socket is not present so the test
//! suite stays green in environments without a running daemon. This is the
//! lightest gate that catches "I broke the socket request format" regressions.

use std::path::PathBuf;

#[path = "../src/socket.rs"]
mod socket;

#[tokio::test]
async fn pings_live_daemon_if_socket_present() {
    let sock: PathBuf = socket::default_socket_path();
    if !sock.exists() {
        eprintln!("skip: no socket at {}", sock.display());
        return;
    }
    let resp = socket::ping_health(&sock)
        .await
        .expect("ping_health should succeed against a running daemon");
    assert!(
        (200..300).contains(&resp.status),
        "expected 2xx status, got {} body={}",
        resp.status,
        resp.body,
    );
    assert!(
        resp.body.contains("\"status\""),
        "expected /health JSON body to contain \"status\", got: {}",
        resp.body,
    );
}
