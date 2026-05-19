<!-- 번역 상태: 초기 동기화. 정본은 README.md (영문). 영문이 갱신되면 docs/i18n-policy.md 의 14d/21d drift 윈도우 안에 본 파일을 동기화한다. -->

[English](README.md)

# @clawket/desktop

Clawket 데스크탑 애플리케이션 — Tauri 2 (Rust shell) + React 19 (Vite + Tailwind v4) + 공유 디자인 시스템.

> 본 sub-repo 는 **정식 릴리즈 전**이며 사용자에게 배포되지 않는다. 현재 사용자
> 표면은 `clawketd` 가 서빙하는 [`clawket/web`](https://github.com/clawket/web)
> 이다. 본 repo 의 첫 GitHub Release 가 발행되면
> [`clawket/components.json#desktop`](https://github.com/clawket/clawket/blob/main/components.json)
> 핀이 `null` (skip) 에서 string tag 로 교체되어 플러그인 install gate 가 OS
> installer 다운로드를 시작한다.

## 구조

pnpm workspace 모노레포.

```
desktop/
├── apps/
│   └── desktop/        # Tauri shell (src-tauri/) + React 앱 (src/)
├── packages/
│   └── ui/             # 공유 디자인 시스템 (@clawket/ui)
├── pnpm-workspace.yaml
├── package.json
├── .nvmrc              # Node 22
└── .gitignore
```

`packages/ui` 는 개인 `ui-package` 가이드의 Component Architecture / CVA /
Styling Chain / Tailwind 빌드 / Storybook / WCAG AA 규약을 따른다.

## Tech stack

| 레이어 | 선택 |
|---|---|
| Shell | Tauri 2.x (Rust) |
| UI 런타임 | React 19 + Vite 6 |
| 스타일 | Tailwind v4 (CSS-first, `@tailwindcss/vite`) |
| Variants | CVA (`class-variance-authority`) |
| Headless 프리미티브 | Radix Primitives (a11y) |
| Storybook | `@storybook/react-vite` |
| 패키지 매니저 | pnpm 9 (workspace) |
| 데몬 전송 | Unix socket (`~/.cache/clawket/clawketd.sock`) + SSE EventSource — `cli/src/client.rs` 와 동일 invariant (UDS-only, TCP fallback 없음) |

## 개발

```bash
pnpm install              # 워크스페이스 의존성
pnpm dev                  # Tauri dev (Vite + Rust shell hot reload)
pnpm build                # production: packages 빌드 → Tauri bundle
pnpm storybook            # @clawket/ui 컴포넌트 카탈로그
pnpm typecheck            # 워크스페이스 전체 tsc -b
pnpm lint                 # 워크스페이스 전체 eslint
```

Tauri shell 은 기동 시 `clawketd` 를 자식 프로세스로 spawn 하고
(`apps/desktop/src-tauri/src/lib.rs:24`), Unix socket 으로 `/health` 를
probe 한다 (`apps/desktop/src-tauri/src/socket.rs`). 이미 데몬이 떠 있으면
두 번째 spawn 은 데몬 자체의 flock 가 거부하고, 앱은 살아있는 socket 으로
fallthrough 한다 — 의도된 동작이다.

## 디자인 자산

Stitch (Google) 가 초기 디자인 시안을 생성. 디자인 토큰의 단일 진실 공급원은
`clawket/.local/stitch_clawket_llm_native_workbench/` 의
`clawket_v3.0_design_tokens.json`. `clawket_v3.0_design_system/DESIGN.md` 의
Material 3 frontmatter 는 무시하고 body 의 semantic 토큰만 사용. 토큰 마이그레이션
노트는 `packages/ui` 및 `apps/desktop` 작업 중 `docs/migration/` 에 쌓인다.

## 데몬 / wrapper 관계

- 본 sub-repo 는 다른 Clawket sub-repo (cli / daemon / web / landing /
  플러그인 shell) 와 동일 레벨로
  [`clawket`](https://github.com/clawket) GitHub Org 아래 위치한다.
- 데몬 바이너리 자체는 그대로 유지 — Tauri 가 자식 프로세스로 spawn 하고 Unix
  socket 으로 통신하며, 패턴은 `cli/src/daemon_autostart.rs` 와 동일.
- 플러그인 install gate
  (`clawket/adapters/shared/claude-hooks.cjs::ensureDesktopBundle`) 가 OS 별
  installer (`.dmg` / `.msi` / `.AppImage`) 를 `pluginRoot/desktop/dl/` 로
  받는다. gate 의 책임은 다운로드 + place 까지이고, 설치 실행은 사용자가 직접.
- v3.0.0 baseline 에서 `clawket/components.json#desktop` 은 `null` sentinel —
  install gate 가 desktop 단계를 no-op skip 한다. 본 repo 의 첫 GitHub Release
  가 string tag 로 핀을 교체하면 gate 가 활성화된다.

## Cross-repo 좌표 (정본 위치)

본 sub-repo 는 자체 git repo 이지만, **cross-repo 좌표의 정본은 플러그인 shell
sub-repo** 가 보유한다. 본 README 가 그곳을 가리킨다:

| 좌표 | 정본 위치 |
|---|---|
| 컴포넌트 핀 (전 sub-repo) | [`clawket/components.json`](https://github.com/clawket/clawket/blob/main/components.json) |
| 호환성 매트릭스 (plugin × cli × daemon × web × desktop) | [`clawket/docs/COMPATIBILITY.md`](https://github.com/clawket/clawket/blob/main/docs/COMPATIBILITY.md) |
| 릴리즈 순서 (daemon → cli → web → desktop → plugin) | [`clawket/docs/RELEASING.md`](https://github.com/clawket/clawket/blob/main/docs/RELEASING.md) |
| 기여 워크플로 (decompose → contract → execute) | [`clawket/docs/CONTRIBUTING.md`](https://github.com/clawket/clawket/blob/main/docs/CONTRIBUTING.md) |
| Wrapper 운영 규칙 | [`clawket/CLAUDE.md`](https://github.com/clawket/clawket/blob/main/CLAUDE.md) (플러그인 sub-repo) |

## 라이선스

MIT — 전문은 [LICENSE](LICENSE) 참조.
