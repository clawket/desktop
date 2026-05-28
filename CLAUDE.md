# clawket/desktop

Clawket 데스크탑 애플리케이션. Tauri 2 (Rust shell) 가 `clawketd` 를 자식 프로세스로 spawn 하고, WebView 안에서 React 19 + Vite SPA 가 동일한 데몬 HTTP/SSE 표면을 소비한다. `packages/ui` 가 공유 디자인 시스템.

> 본 파일은 **이 sub-repo (desktop)** 의 AI 컨텍스트 정본이다. Cross-repo 좌표 (compatibility matrix, release order, plugin install gate) 는 wrapper 인 `github.com/clawket/clawket` 의 `CLAUDE.md` + `docs/COMPATIBILITY.md` + `docs/RELEASING.md` 가 단일 진실 공급원 — 여기에 옮기지 않는다. `components.json#desktop = null` (pre-release sentinel) 이고, 첫 GitHub Release 가 발행되면 string tag 로 교체된다.

## Stack

| 항목 | 버전 / 비고 |
|---|---|
| 패키지 매니저 | pnpm 9 (workspace) — `package.json:6-9` |
| Node | ≥ 22 (`.nvmrc`, `package.json:7`) |
| Shell | Tauri 2.x (Rust) — `apps/desktop/src-tauri/Cargo.toml:18` |
| Rust edition | 2021 (`rust-version = "1.77"`) — `apps/desktop/src-tauri/Cargo.toml:7` |
| UI 런타임 | React 19 + Vite 6 — `apps/desktop/package.json:21-22,40` |
| 스타일 | Tailwind v4 (`@tailwindcss/vite`) — CSS-first, `tailwind.config.*` 금지 |
| 공유 UI | `@clawket/ui` (workspace 패키지, `packages/ui/`) |
| 테스트 | vitest 2 + RTL 16 + jsdom 26 |
| 데몬 통신 | Unix socket 전용 (`~/.cache/clawket/clawketd.sock`) — `apps/desktop/src-tauri/src/socket.rs` |

## Workspace layout

```
desktop/
├── apps/desktop/             # Tauri 앱
│   ├── src-tauri/            # Rust shell
│   │   ├── src/
│   │   │   ├── main.rs       # Windows console suppression + lib::run
│   │   │   ├── lib.rs        # tauri::Builder, daemon spawn, /health ping
│   │   │   ├── daemon.rs     # clawketd 자식 프로세스 spawn 로직
│   │   │   ├── socket.rs     # UDS 기반 minimal HTTP client (CLI 와 동일 invariant)
│   │   │   └── token.rs      # tauri::command read_token (X-Clawket-Token 헤더용)
│   │   ├── capabilities/default.json   # core:default 만 허용
│   │   ├── tauri.conf.json
│   │   └── Cargo.toml
│   ├── src/                  # React SPA
│   │   ├── App.tsx           # AppShell + Sidebar + Topbar + DetailDrawer
│   │   ├── shell/            # Sidebar / Topbar / Modals / DetailDrawer / Panels
│   │   ├── views/            # SummaryView / BoardView / BacklogView / TimelineView / WikiView
│   │   ├── data/             # DataProvider, api.ts, planTree.ts, types.ts
│   │   └── test/             # vitest setup
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── packages/ui/              # @clawket/ui (shared design system)
│   └── src/{components,lib,styles}/
├── docs/migration/           # Stitch → 코드 마이그레이션 노트
├── pnpm-workspace.yaml
└── package.json              # workspace root
```

## Critical contracts (file:line 근거)

| 계약 | 위치 |
|---|---|
| Tauri shell 진입: `main()` → `clawket_desktop_lib::run()`. Windows console 은 release 빌드에서 suppress. | `apps/desktop/src-tauri/src/main.rs:2-6` |
| 데몬 자동 spawn — `daemon::spawn()` 가 실패해도 (이미 떠 있어 flock 거부 등) shell 은 fallthrough. UI 는 socket ping 결과로 liveness 판정. | `apps/desktop/src-tauri/src/lib.rs:24-43` |
| `/health` ping 은 Tauri async runtime 에서 300ms 후 1회. mainline 렌더 차단 없음. | `apps/desktop/src-tauri/src/lib.rs:48-67` |
| UDS-only transport (TCP fallback 금지) — `apps/desktop/src-tauri/src/socket.rs` 주석이 CLI 의 `cli-unix-socket-only-no-tcp-fallback.md` rule 을 명시 인용. | `apps/desktop/src-tauri/src/socket.rs:1-4` |
| 기본 socket 경로 = `$XDG_CACHE_HOME/clawket/clawketd.sock` (fallback `~/.cache/clawket/clawketd.sock`). CLI 와 동일. | `apps/desktop/src-tauri/src/socket.rs:22-29` |
| Tauri capabilities = `core:default` 만. fs / shell / http 등 광범위 권한 미허용. | `apps/desktop/src-tauri/capabilities/default.json:6` |
| 활성 프로젝트 first-run fallback = `PROJ-lattice-mono` (이후는 localStorage `clawket.activeProjectId` + 데몬 `/projects` 결과). | `apps/desktop/src/App.tsx:25` |
| Tauri command `read_token` 는 frontend 에서 `invoke('read_token')` 으로 호출. 데몬 X-Clawket-Token 헤더 fallback 용. | `apps/desktop/src-tauri/src/token.rs`, registered at `lib.rs:17` |
| 버전 SSoT = `apps/desktop/package.json#version` (release infra 의 `sync-version.mjs` 가 src-tauri/tauri.conf.json + Cargo.toml 을 빌드 직전 동기화). | pre-release baseline `0.1.0` (3 곳 동일 유지) |
| `apps/*/src-tauri/Cargo.lock` 은 **커밋**. Tauri Rust 크레이트는 바이너리이므로 cli / daemon 과 동일 convention. | `.gitignore` (해당 패턴 제외됨) |

## React 표면

`AppShell` (from `@clawket/ui`) + `CommandSurface` (Cmd+K palette) 위에:

- `shell/Sidebar` — ProjectSwitcher + PlanTree + 6 view 진입.
- `shell/Topbar` — 활성 cycle / plan 표시.
- `shell/DetailDrawer` — 우측 슬라이드 패널 (Task/Unit/Plan/Cycle detail).
- `views/{SummaryView, BoardView, BacklogView, TimelineView, WikiView}` — `clawket/web` 의 6-view 와 동일한 데이터 소비.
- `data/DataProvider` — `api.ts` (UDS over Tauri command 또는 fetch) 로 데몬 호출, planTree 빌드.

`@clawket/ui` 가 노출하는 핵심 컴포넌트: `AppShell`, `CommandSurface`, `PlanTree`, `TaskCard`, `TaskDetail`, `Sidebar` primitives (`Button`, `Input`, `Badge`, `StatusPill`, `AgentTag`, `TierMark`, `EvidenceChip`, `CollapsibleFilters`).

## Build / test / run

| 명령 | 용도 |
|---|---|
| `pnpm install` | 워크스페이스 의존성 |
| `pnpm dev` | Tauri dev — Vite (frontend) + Rust shell (HMR). `apps/desktop/package.json:7` |
| `pnpm build` | packages build → `apps/desktop` Vite build → Tauri bundle |
| `pnpm typecheck` | 워크스페이스 전체 `tsc -b` |
| `pnpm lint` | 워크스페이스 전체 `eslint` (CI gate) |
| `pnpm test` | 워크스페이스 전체 `vitest run` |
| `pnpm storybook` | `@clawket/ui` 컴포넌트 카탈로그 |
| `pnpm --filter @clawket/desktop test:watch` | 앱 한정 vitest watch |

CI workflow (`.github/workflows/ci.yml` — 사후 추가 예정): `pnpm typecheck` + `pnpm lint` + `pnpm test`. 첫 release 시 `release.yml` (`tauri-action` 매트릭스 + bump-manifest) 가 별도 추가된다 — release infra 는 별도 plan 의 책임.

## Design system 컨텍스트

Stitch (Google) 생성 디자인 시안의 토큰 정본은 `clawket/.local/stitch_clawket_llm_native_workbench/clawket_v3.0_design_tokens.json`. `DESIGN.md` 의 Material 3 frontmatter 는 무시하고 body 의 semantic 토큰만 사용. 마이그레이션 노트가 누적되는 위치는 `docs/migration/{component-map,cutover-checklist,sse-patterns,tier-scenario-batch}.md`.

`packages/ui` 의 styling chain: `src/styles/tokens.css` (시맨틱 토큰 정본) → `src/styles/base.css` (Tailwind layer + reset) → `apps/desktop/src/index.css` 가 `@import '@clawket/ui/styles/tokens.css'` + `@import 'tailwindcss'` 순서로 결합. `tailwind.config.*` 파일은 생성하지 않는다 (v4 CSS-first invariant — `clawket/web/.claude/rules/tailwind-v4-css-first.md` 와 동일 정신).

## Cross-repo 좌표

릴리즈 order, 컴포넌트 핀 (`components.json`), 플러그인 install gate (`ensureInstalled` → `ensureDesktopBundle`), 호환성 매트릭스, 훅 enforcement 설계, i18n / vendor 정책은 모두 wrapper repo (`github.com/clawket/clawket`) 의 정본 문서가 관리한다:

- `clawket/CLAUDE.md` — wrapper 운영 규칙 + 컴포넌트 좌표
- `clawket/docs/RELEASING.md` — 릴리스 순서·체크리스트
- `clawket/docs/COMPATIBILITY.md` — daemon ↔ cli ↔ web ↔ desktop ↔ plugin 버전 범위
- `clawket/components.json` — desktop 의 핀 (`null` sentinel, 첫 release 발행 시 string tag)
- `clawket/adapters/shared/claude-hooks.cjs::ensureDesktopBundle` — install gate 의 desktop bundle 다운로드 책임

위 내용은 이 파일에서 중복하지 않는다.

## AI 가드레일 (desktop-local)

1. **사용자가 명시적으로 지시하지 않는 한 commit / push 금지** (wrapper 규칙과 동일).
2. **변경 후 검증 전 done 보고 금지** — 프런트 변경은 `pnpm typecheck` + `pnpm lint` + `pnpm test`, Rust 변경은 `cd apps/desktop/src-tauri && cargo check` (가능하면 `cargo clippy --all-targets`). 활성 task 에 `--evidence` 로 file:line 또는 reasoning summary 를 항상 동봉.
3. **Tauri capabilities 광범위화 금지.** `apps/desktop/src-tauri/capabilities/default.json` 에 `core:default` 외 권한을 추가하려면 PR 본문에 명시적 정당화. WebView 는 shell 을 신뢰하므로 capability 표면이 곧 데몬 공격 표면.
4. **UDS-only transport invariant 유지.** `apps/desktop/src-tauri/src/socket.rs` 가 CLI 의 `cli-unix-socket-only-no-tcp-fallback.md` 를 명시 인용한다 — TCP fallback / 토큰 자동 dial / port 파일 fallback 추가 금지. 새 Rust 모듈이 데몬에 직접 dial 한다면 동일 invariant 를 따른다.
5. **버전 3 곳 동시 핸드 편집 금지.** `apps/desktop/{package.json,src-tauri/tauri.conf.json,src-tauri/Cargo.toml}` 세 곳의 version 은 release infra 의 `sync-version.mjs` 가 빌드 직전 동기화하도록 설계되어 있다. release infra 가 land 되기 전까지 세 곳 모두 baseline `0.1.0` 유지.
6. **`apps/*/src-tauri/Cargo.lock` 은 커밋.** Tauri Rust 크레이트는 바이너리 — cli/daemon convention 과 동일. `.gitignore` 에서 제외하면 안 된다.
7. **Tailwind v4 CSS-first invariant 유지.** `tailwind.config.{js,ts}` / `postcss.config.js` 신설 금지, `@apply` 신규 도입 금지, JSX 에 hex `bg-[#…]` 금지 — `packages/ui/src/styles/tokens.css` 가 single source. `clawket/web/.claude/rules/tailwind-v4-css-first.md` 와 동일 정신.
8. **데몬 변경 동반 시 cross-repo PR.** SSE 이벤트명 / envelope / HTTP 응답 모양 변경은 `clawket/daemon` 측 emit / 응답과 같은 release cycle 에서 짝지어 land — 본 sub-repo 단독 변경 금지. `clawket/web/.claude/rules/sse-event-synchronization.md` 의 consumer 측 invariant 와 동일.
9. **편집 전 파일 reread.** `App.tsx` / `lib.rs` / `tauri.conf.json` 등 cross-cutting 파일은 stale context 위험이 크다 (`mechanical-overrides.md` §9).
