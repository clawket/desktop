# Component map — web → @clawket/ui → desktop

Snapshot: 2026-05-14. `desktop/` is the v3.0 Tauri renderer; `web/` is the
legacy Vite SPA still served by the daemon. This table is a navigation aid for
a contributor who knows the legacy file but needs to find the corresponding
design-system export and its desktop consumer.

## How to use this table

- **Legacy path** — relative to `web/src/` in the `clawket/web` repository.
- **Role** — one-line summary of what the legacy file did.
- **@clawket/ui export** — the replacement exported from
  `desktop/packages/ui/src/index.ts`. `—` means no replacement (intentionally
  dropped or not yet covered).
- **Desktop consumer** — the file under `desktop/apps/desktop/src/` that wires
  the replacement into the running app. `—` means the replacement exists in
  `@clawket/ui` but no view consumes it yet, or the legacy role was retired.
- A "no replacement" row carries a short reason in italics under the row's
  Desktop-consumer cell. Reasons are descriptive, not aspirational — if the
  reason changes, edit this file rather than adding history notes.

Tests (`*.test.tsx`) are not listed: they migrate alongside the file they
exercise and never have their own row.

## Views and shell

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/SummaryView.tsx` | Plan/unit/cycle overview dashboard | — *(view is composed directly from primitives: StatusPill, TaskCard, Badge)* | `views/SummaryView.tsx` |
| `components/BoardView.tsx` | Status-column kanban | — *(view composed from `TaskCard` + plain layout)* | `views/BoardView.tsx` |
| `components/BacklogView.tsx` | Filterable task list scoped to active plan | — *(view composed from `TaskCard` + filter chips built inline)* | `views/BacklogView.tsx` |
| `components/TimelineView.tsx` | Reverse-chronological activity feed | — *(view composed from semantic tokens + `StatusPill` only)* | `views/TimelineView.tsx` |
| `components/WikiView.tsx` | Two-pane wiki reader (tree + markdown) | — *(view composed from custom tree + `react-markdown`)* | `views/WikiView.tsx` |
| `components/Sidebar.tsx` | Project label + active context + plan tree shell | `AppShell.Sidebar` (frame) + `PlanTree` (body) | `shell/Sidebar.tsx` |
| `components/Header.tsx` | Top bar (view tabs + palette trigger) | `AppShell.Content` *(host for the bar)* | `shell/Topbar.tsx` |
| `components/PlanDetail.tsx` | Plan inspector pane embedded in PlansView | — *(inlined as `PlanDetail` subcomponent in `views/PlansView.tsx`)* | `views/PlansView.tsx` |
| `components/UnitDetail.tsx` | Unit inspector pane embedded in PlansView | — *(inlined as `UnitDetail` subcomponent in `views/PlansView.tsx`)* | `views/PlansView.tsx` |
| `components/TaskDetail.tsx` | Task inspector pane | `TaskDetail` (compound: `TaskDetail.Header`, `TaskDetail.Body`, `TaskDetail.Meta`) | `views/PlansView.tsx`, `views/BacklogView.tsx`, `views/BoardView.tsx` |

## Trees, palettes, breadcrumbs

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/PlanTree.tsx` | Recursive plan → unit → task tree | `PlanTree` | `shell/Sidebar.tsx` |
| `components/TaskTreeView.tsx` | Subtree of one plan (used inside PlanDetail) | `PlanTree` *(same component, rooted at one plan)* | `views/PlansView.tsx` *(via inlined PlanDetail)* |
| `components/TaskBreadcrumb.tsx` | Plan → unit → task path display | — *(role absorbed by `TaskDetail.Header` ticket + title layout; no separate breadcrumb component)* | — |
| `components/CommandPalette.tsx` | ⌘K palette | `CommandSurface` | `App.tsx` |

## Task-detail subviews

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/task-detail/TaskSections.tsx` | Artifacts / runs / questions blocks | — *(legacy concept; current desktop scope shows status + body only via `TaskDetail`)* | — *(not surfaced in v3.0 desktop yet)* |
| `components/task-detail/TaskComments.tsx` | Comment thread on a task | — *(comments not surfaced in v3.0 desktop)* | — |
| `components/task-detail/TaskSubTasks.tsx` | Inline sub-task list/editor | — *(subtask editing not surfaced in v3.0 desktop)* | — |

## Board internals

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/board/TaskCard.tsx` | Task chip rendered inside a column | `TaskCard` | `views/BoardView.tsx`, `views/BacklogView.tsx`, `views/SummaryView.tsx` |
| `components/board/DroppableColumn.tsx` | DnD drop target wrapper | — *(no drag-and-drop in v3.0 desktop; column is a plain `<section>`)* | — |
| `components/board/ArchivedSection.tsx` | Collapsed `done`/`cancelled` strip | — *(BoardView shows all four status columns inline; no separate archived bucket)* | — |
| `components/board/NewCycleModal.tsx` | Modal: create a new cycle | — *(no modal flows in v3.0 desktop)* | — |
| `components/board/constants.ts` | Column id/labels/order | — *(constants inlined in `views/BoardView.tsx`)* | `views/BoardView.tsx` |

## Modals and forms

The v3.0 desktop snapshot is read-only against the daemon — no creation flows
yet. Every modal/form below has no replacement and no desktop consumer.

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/CreatePlanModal.tsx` | Modal: create a plan | — *(no create flows in v3.0 desktop)* | — |
| `components/CreateUnitModal.tsx` | Modal: create a unit | — | — |
| `components/CreateTaskModal.tsx` | Modal: create a task | — | — |
| `components/HelpModal.tsx` | Keyboard shortcut cheatsheet | — *(palette doubles as discovery surface)* | — |
| `components/ProjectSettings.tsx` | Project metadata editor | — *(no settings surface in v3.0 desktop)* | — |
| `components/EnvelopeForm.tsx` | Envelope-schema CRUD form (v2 carryover) | — *(envelope schema is daemon-internal; UI surface removed)* | — |

## Status, badges, toasts

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/StatusBadge.tsx` | Task status pill (`todo`/`in_progress`/`blocked`/`done`/`cancelled`) | `StatusPill` | `views/PlansView.tsx`, `views/BoardView.tsx`, `views/BacklogView.tsx`, `views/SummaryView.tsx`, `views/TimelineView.tsx` |
| `components/Toast.tsx` | Transient notification | — *(no toast surface in v3.0 desktop; errors are inline in views)* | — |

## ui/ primitives

| Legacy path | Role | @clawket/ui export | Desktop consumer |
| --- | --- | --- | --- |
| `components/ui/Button.tsx` | Button primitive | `Button` | `views/*` (filter chips), `shell/Topbar.tsx` |
| `components/ui/Badge.tsx` | Generic badge | `Badge` | `views/SummaryView.tsx`, `views/BacklogView.tsx` |
| `components/ui/Input.tsx` | Text input primitive | `Input` | `views/BacklogView.tsx` *(filter search)*, `CommandSurface` query field |
| `components/ui/Label.tsx` | Form label primitive | `Label` (re-exported from `Input/Label`) | — *(no forms in v3.0 desktop yet)* |
| `components/ui/Textarea.tsx` | Multiline input primitive | — *(no multiline form fields in v3.0 desktop)* | — |
| `components/ui/Select.tsx` | Native select primitive | — *(filter UIs use button-group chips instead)* | — |
| `components/ui/Modal.tsx` | Modal frame | — *(no modals in v3.0 desktop)* | — |
| `components/ui/index.ts` | Barrel | `desktop/packages/ui/src/index.ts` | — |

## New in @clawket/ui (no legacy counterpart)

| @clawket/ui export | Role | Desktop consumer |
| --- | --- | --- |
| `AppShell.Root` / `.Sidebar` / `.Content` / `.Main` | Layout primitives that replace the bespoke flexbox in `Header.tsx` + `Sidebar.tsx` | `App.tsx`, `shell/Sidebar.tsx` |
| `AgentTag` | Assignee/agent chip used inside `TaskCard` | `views/BoardView.tsx`, `views/BacklogView.tsx` *(via `TaskCard`)* |
| `TierMark` | Visual indicator for `low` / `med` / `high` task tier | `views/PlansView.tsx`, `views/BacklogView.tsx` *(via `TaskCard`)* |
| `EvidenceChip` | Indicator that a task was completed with daemon-attached evidence | `TaskDetail` *(slot)*, currently inert in views (evidence not surfaced in v3.0) |
| `FormField` / `HelperText` | Form-row composition primitives | — *(no forms in v3.0 desktop)* |
