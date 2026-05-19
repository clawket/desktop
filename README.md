# @clawket/desktop

Clawket desktop application — Tauri 2 (Rust shell) + React 19 (Vite + Tailwind v4) + shared design system.

> This sub-repo is **pre-release** and not yet distributed to end users. The
> user-facing surface today is [`clawket/web`](https://github.com/clawket/web)
> served by `clawketd`. The first GitHub Release will flip
> [`clawket/components.json#desktop`](https://github.com/clawket/clawket/blob/main/components.json)
> from `null` (skip) to a string tag, at which point the plugin install gate
> begins downloading the OS installer.

[한국어](README.ko.md)

## Layout

pnpm workspace monorepo.

```
desktop/
├── apps/
│   └── desktop/        # Tauri shell (src-tauri/) + React app (src/)
├── packages/
│   └── ui/             # Shared design system (@clawket/ui)
├── pnpm-workspace.yaml
├── package.json
├── .nvmrc              # Node 22
└── .gitignore
```

`packages/ui` follows the component-architecture / CVA / styling-chain /
Tailwind-build / Storybook / WCAG-AA conventions from the personal `ui-package`
guide.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2.x (Rust) |
| UI runtime | React 19 + Vite 6 |
| Styling | Tailwind v4 (CSS-first, `@tailwindcss/vite`) |
| Variants | CVA (`class-variance-authority`) |
| Headless primitives | Radix Primitives (a11y) |
| Storybook | `@storybook/react-vite` |
| Package manager | pnpm 9 (workspace) |
| Daemon transport | Unix socket (`~/.cache/clawket/clawketd.sock`) + SSE EventSource — same invariant as `cli/src/client.rs` (UDS-only, no TCP fallback) |

## Development

```bash
pnpm install              # workspace deps
pnpm dev                  # Tauri dev (Vite + Rust shell with hot reload)
pnpm build                # production: packages build → Tauri bundle
pnpm storybook            # @clawket/ui component catalogue
pnpm typecheck            # workspace-wide tsc -b
pnpm lint                 # workspace-wide eslint
```

The Tauri shell spawns `clawketd` as a child process on startup
(`apps/desktop/src-tauri/src/lib.rs:24`) and probes `/health` over the Unix
socket (`apps/desktop/src-tauri/src/socket.rs`). If a daemon is already
running, the second spawn is rejected by the daemon's own flock and the app
falls through to the live socket — this is intentional.

## Design assets

Stitch (Google) generated the initial design comps; the source-of-truth
design tokens live under `clawket/.local/stitch_clawket_llm_native_workbench/`
(`clawket_v3.0_design_tokens.json`). The Material 3 frontmatter in
`clawket_v3.0_design_system/DESIGN.md` is ignored — only the body's semantic
tokens are adopted. Token migration notes accumulate in `docs/migration/`
during work on `packages/ui` and `apps/desktop`.

## Daemon / wrapper relationship

- This sub-repo sits next to the other Clawket sub-repos (cli / daemon / web /
  landing / clawket plugin shell) under the
  [`clawket`](https://github.com/clawket) GitHub org.
- The daemon binary itself is unchanged — Tauri spawns it as a child and talks
  over the Unix socket using the same pattern as `cli/src/daemon_autostart.rs`.
- The plugin install gate
  (`clawket/adapters/shared/claude-hooks.cjs::ensureDesktopBundle`) is
  responsible for downloading the OS-specific installer (`.dmg` / `.msi` /
  `.AppImage`) into `pluginRoot/desktop/dl/`. The gate downloads and places;
  the user runs the installer themselves.
- At the v3.0.0 baseline `clawket/components.json#desktop` is `null`
  (sentinel), so the install gate no-ops the desktop step. The first GitHub
  Release of this repo will flip the pin to a string tag and activate the
  gate.

## Cross-repo coordinates (canonical location)

This sub-repo is its own git repo, but **the canonical source for cross-repo
coordinates lives in the plugin shell sub-repo**. This README points at it
rather than duplicating:

| Coordinate | Canonical location |
|---|---|
| Component pins (all sub-repos) | [`clawket/components.json`](https://github.com/clawket/clawket/blob/main/components.json) |
| Compatibility matrix (plugin × cli × daemon × web × desktop) | [`clawket/docs/COMPATIBILITY.md`](https://github.com/clawket/clawket/blob/main/docs/COMPATIBILITY.md) |
| Release order (daemon → cli → web → desktop → plugin) | [`clawket/docs/RELEASING.md`](https://github.com/clawket/clawket/blob/main/docs/RELEASING.md) |
| Contribution workflow (decompose → contract → execute) | [`clawket/docs/CONTRIBUTING.md`](https://github.com/clawket/clawket/blob/main/docs/CONTRIBUTING.md) |
| Wrapper operating rules | [`clawket/CLAUDE.md`](https://github.com/clawket/clawket/blob/main/CLAUDE.md) (plugin sub-repo) |

## License

MIT — see [LICENSE](LICENSE).
