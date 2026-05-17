mod daemon;
mod socket;
mod token;

use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
struct DaemonState {
    handle: Mutex<Option<daemon::DaemonHandle>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DaemonState::default())
        .invoke_handler(tauri::generate_handler![token::read_token])
        .setup(|app| {
            // 1. Try to spawn the daemon as a child. If clawketd is already
            //    running (PID exists, socket bound), this will start a second
            //    instance which the daemon's own flock will reject — we
            //    tolerate that and rely on `ping_health` to confirm liveness.
            //    For first-run dev, fallback message is printed to stderr.
            match daemon::spawn() {
                Ok(handle) => {
                    eprintln!(
                        "clawket-desktop: daemon spawned bin={} pid={}",
                        handle.bin.display(),
                        handle.child.id()
                    );
                    let state: tauri::State<DaemonState> = app.state();
                    {
                        let mut guard = state.handle.lock().expect("daemon lock poisoned");
                        *guard = Some(handle);
                    }
                }
                Err(e) => {
                    eprintln!(
                        "clawket-desktop: daemon spawn skipped/failed: {e}. \
                         Will attempt to use an already-running daemon."
                    );
                }
            }

            // 2. Ping the daemon over Unix socket once it has had a moment to
            //    bind. We do this on the tauri async runtime so the main
            //    thread can continue to render the window.
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let sock = socket::default_socket_path();
                match socket::ping_health(&sock).await {
                    Ok(resp) => {
                        eprintln!(
                            "clawket-desktop: daemon ping ok status={} sock={} body={}",
                            resp.status,
                            sock.display(),
                            resp.body.chars().take(200).collect::<String>(),
                        );
                    }
                    Err(e) => {
                        eprintln!(
                            "clawket-desktop: daemon ping failed sock={} err={e}",
                            sock.display(),
                        );
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
