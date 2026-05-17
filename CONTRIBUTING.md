# Contributing to `clawket/desktop`

The Clawket desktop application — Tauri 2 (Rust shell) spawning `clawketd`
as a child process, React 19 + Vite SPA inside the WebView, shared design
system in `packages/ui`. pnpm workspace monorepo. Pre-release at the v3.0.0
baseline (`clawket/components.json#desktop = null`); the first GitHub
Release will activate the plugin install gate.

## Cross-repo workflow

The cross-repo contribution model (decompose → contract → execute, active-task
gate, PR / commit conventions, Conventional Commits bump policy, Code of Conduct)
is canonical in the meta repo:

- [`clawket/clawket` › `docs/CONTRIBUTING.md`](https://github.com/clawket/clawket/blob/main/docs/CONTRIBUTING.md) — workflow + repo layout + submission rules
- [`clawket/clawket` › `docs/RELEASING.md`](https://github.com/clawket/clawket/blob/main/docs/RELEASING.md) — release order across the seven repos
- [`clawket/clawket` › `CODE_OF_CONDUCT.md`](https://github.com/clawket/clawket/blob/main/CODE_OF_CONDUCT.md) — Contributor Covenant v2.1; reports go to **conduct@clawket.dev**

Do not duplicate those rules here — they live in one place to avoid drift.

## Local setup

```bash
git clone https://github.com/clawket/desktop
cd desktop
pnpm install                              # workspace deps
pnpm --filter @clawket/ui build           # build the shared UI package
pnpm dev                                  # Tauri dev (Vite + Rust shell + HMR)
```

You need the Rust toolchain (`rustup toolchain install stable`) for the
Tauri shell. The shell will try to spawn `clawketd` automatically; for that
you need `clawketd` discoverable via `CLAWKET_DAEMON_BIN` env, `$PATH`, or
one of the XDG candidate paths used by the CLI's
`daemon_autostart::resolve_daemon_bin`. Build the daemon from
[`clawket/daemon`](https://github.com/clawket/daemon) or
`brew install clawket/tap/clawketd`.

If a daemon is already running, the Tauri spawn is rejected by the daemon's
own flock and the app falls through to the live socket — intentional.

## Scripts

```bash
pnpm dev                       # Tauri dev (Vite + Rust shell, hot reload)
pnpm build                     # packages build → Tauri production bundle
pnpm typecheck                 # workspace-wide tsc -b
pnpm lint                      # workspace-wide eslint
pnpm test                      # workspace-wide vitest run
pnpm storybook                 # @clawket/ui component catalogue
pnpm --filter @clawket/desktop test:watch   # app-only vitest watch
```

CI runs `pnpm typecheck`, `pnpm lint`, and `pnpm test` on every push/PR.

## Repo-specific PR rules

- Branch off `main`. Version SSoT is `apps/desktop/package.json#version` —
  once the release workflow lands, `apps/desktop/src-tauri/tauri.conf.json`
  and `apps/desktop/src-tauri/Cargo.toml` will be synced from it
  automatically via a pre-build script. **Do not edit any of the three
  version fields by hand** until that workflow is in place; at v3.0.0
  baseline they all stay at `0.1.0`.
- `apps/*/src-tauri/Cargo.lock` is **committed** (Tauri Rust crate is a
  binary application — committing the lockfile matches the cli / daemon
  convention and keeps builds reproducible). If you add new Rust deps,
  commit the lockfile change.
- Tauri capabilities (`apps/desktop/src-tauri/capabilities/default.json`)
  expose `core:default` only at this baseline. Widening the permission set
  (e.g. `fs:*`, `shell:*`, `http:*`) requires a written justification on
  the PR — the WebView trusts the shell, so the permission surface is
  effectively the daemon attack surface.
- The daemon transport is **Unix socket only** in both the Rust shell
  (`apps/desktop/src-tauri/src/socket.rs`) and the React app via the
  `@clawket/ui` data layer. Mirror the `cli/.claude/rules/cli-unix-socket-only-no-tcp-fallback.md`
  invariant — do not add TCP fallback, token loading, or port-file dial.
- React + design-system invariants (Tailwind v4 CSS-first, dnd-kit overlay
  state, SSE event sync, cookie + X-Header dual auth, React 19
  `use()`/`<Activity>` discipline) carry over from
  [`clawket/web`](https://github.com/clawket/web). Re-read those repo-specific
  rules under `clawket/web/.claude/rules/` before reusing the same patterns
  here.
- The path-separation invariant (LM-8) is enforced by the spawned daemon.
  Do not introduce shell-side code that writes user data under
  `~/.claude/plugins/` — see the wrapper `CLAUDE.md` § "Path separation
  invariant".
