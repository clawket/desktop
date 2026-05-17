# Web → Tauri cutover checklist

Snapshot: 2026-05-14. This document is the contract between Phase 6 (this
migration guide) and the future web-decommission plan. The actual cutover —
turning `web/` off, retiring the daemon's `/` static serve, and redirecting
users to the Tauri build — is **not** in Phase 6 scope. The checklist below
exists so Phase 7's deployment work has a concrete target, and so any later
plan that finally fires the cutover starts from a known set of gates instead
of inventing them under deadline pressure.

Use this as a runbook, not a wishlist. Each gate is a binary yes/no that the
operator can verify before pulling the trigger.

## 1. Pre-cutover gates

### 1.1 Feature parity

For each web surface, confirm the desktop renderer covers every flow a user
relies on. The current desktop snapshot is read-only against the daemon —
nothing creates plans, units, cycles, tasks, or comments. The cutover cannot
fire until those flows exist in the desktop, or until the team explicitly
accepts a read-only successor for a deprecation window.

- [ ] Summary view (`apps/desktop/src/views/SummaryView.tsx`) renders active
      plan / active cycle / active task with the same fields a web user sees.
- [ ] Plans view (`PlansView.tsx`) supports the plan → unit → task drill-down
      that legacy `web/src/components/PlanDetail.tsx` provided.
- [ ] Board view (`BoardView.tsx`) covers the four status columns. Note: v3.0
      desktop has no drag-and-drop; if the web kanban allowed DnD task moves,
      either reimplement here or document the gap as accepted-loss.
- [ ] Backlog view (`BacklogView.tsx`) supports the status / tier / assignee
      / query filters the web backlog exposed.
- [ ] Timeline view (`TimelineView.tsx`) renders the same `event_type`
      coverage the web timeline did. Document any event types the desktop
      filters out today.
- [ ] Wiki view (`WikiView.tsx`) renders every `Knowledge` entry with
      `type === "wiki"`. Confirm parent/child indent matches the web tree
      layout.
- [ ] Mutating flows (create plan / create unit / create task / start task /
      complete task with evidence / cancel task / approve unit / activate
      cycle / archive plan) either exist on the desktop or carry an explicit
      "deferred — use CLI" sign-off. The CLI is the SSoT for mutation in v3.0,
      so a temporary "use `clawket` directly" answer is acceptable if
      communicated.

### 1.2 SSE reconnect proven

The desktop renderer must survive a daemon restart without manual reload.

- [ ] Kill `clawketd` while the desktop is open. Confirm the next event the
      daemon emits (after restart) flows into the view within ~5 s without
      user action.
- [ ] Same check across a network blip (toggle `tower-http`'s tracing-level
      socket close).
- [ ] `sse.readyState` transitions from `open` → `connecting` → `open` in
      `useData()` state, and views that depend on derived state catch up
      (no stale-counter regression on Plans / Board).

### 1.3 Packaging signed for all three platforms

- [ ] macOS `.dmg` — Apple Developer ID signed + notarized.
- [ ] Windows `.msi` — code-signed (EV cert preferred; OV acceptable).
- [ ] Linux `.AppImage` — GPG signature published next to the artifact.
- [ ] Auto-update channel decided (Tauri updater vs. manual). If updater is
      on, signing key custody documented before the cutover plan ships.

## 2. Daemon compatibility

The desktop pin must agree with the live daemon major before the cutover.

- [ ] `clawket/components.json` carries a `desktop` entry alongside the
      existing `daemon`, `cli`, `web` pins. The Phase 7 plan adds this entry;
      the cutover plan must verify the pin is on the correct major.
  - Current `components.json` snapshot:
    ```json
    {
      "daemon": "v3.0.0",
      "cli": "v3.0.0",
      "web": "v3.0.0",
      "vendor_adapter": null
    }
    ```
- [ ] `clawket doctor` passes on a fresh install of the candidate desktop
      build against the candidate daemon build.
- [ ] The SSE event vocabulary (`task:{created,updated,deleted,started,done,
      cancelled}`, `cycle:{created,updated,deleted}`, `plan:{created,updated,
      deleted}`, `unit:{created,updated,deleted}`, `knowledge:{created,
      updated,deleted}`, `comment:{created,deleted}`) is unchanged between
      the pinned daemon and the desktop's `KNOWN_EVENT_NAMES` array
      (`apps/desktop/src/data/hooks/useEvents.ts:115-136`). If a new event
      lands, both ends bump together.
- [ ] `EVIDENCE_REQUIRED` (HTTP 400 + structured `code` field) surfaces in
      the desktop UI as a non-destructive form error, not a 500. Verify on a
      `task.status=done` attempt with empty `evidence`.

## 3. Data path invariants (LM-8)

The path-separation invariant (`clawket/CLAUDE.md` "Path separation invariant
(LM-8)") must hold under the desktop install layout.

- [ ] On a clean machine, install the desktop build. Confirm the daemon (auto-
      started or shipped inside the bundle) writes its SQLite to
      `~/.local/share/clawket/` and **never** to a path under
      `~/.claude/plugins/clawket-*/`.
- [ ] `clawket doctor` `[Path separation invariant (LM-8)]` section reports
      `✓ OK` for all five paths (data / cache / config / state / db).
- [ ] If the desktop ships its own bundled daemon binary, the binary path
      under the Tauri resources directory is the only thing inside the app
      bundle — runtime state never leaks back into the read-only bundle.
- [ ] `CLAWKET_ALLOW_PLUGIN_OVERLAP` is **not** set in the shipped installer
      environment. If a developer needs it for local testing, it stays
      developer-local.

## 4. Rollback plan

A user who upgrades and then needs the web app back must have a clean path.

- [ ] Daemon `/` static serve is **unchanged** during the cutover window —
      web continues to be reachable at `http://localhost:19400`. The cutover
      plan documents the day this guarantee is withdrawn (separate
      web-decommission plan).
- [ ] The desktop installer does not modify the daemon's web bundle on disk
      and does not unregister the daemon's web route.
- [ ] Uninstalling the desktop build leaves user data intact (LM-8 keeps it
      outside the app bundle by construction; this check confirms the
      installer agrees).
- [ ] A user who wants to revert to web-only opens `http://localhost:19400`
      in their browser. No CLI ceremony required during the cutover window.

## 5. Communication

- [ ] Cutover announcement lands in `clawket/README.md` and
      `clawket/docs/RELEASING.md` (the latter is the SSoT for release order).
      The desktop sub-repo's `README.md` reflects the same date.
- [ ] `clawket/docs/COMPATIBILITY.md` gains a row for the desktop component
      that lists its supported daemon major and minimum CLI version.
- [ ] The four migration docs under `desktop/docs/migration/` (`component-
      map.md`, `tier-scenario-batch.md`, `sse-patterns.md`, and this file)
      survive the cutover. They are written as snapshots, not changelogs,
      so they keep their value after web is retired — but the cutover plan
      must confirm none of them reference web-only behavior that would
      become stale after the decommission.
- [ ] CLI / MCP users: confirm the CLI continues to work against the
      cutover-day daemon. The CLI is the mutation SSoT today; a desktop
      cutover should not change that contract.

## 6. What this checklist does not cover

- The web-decommission itself (turning off the daemon's `/` static serve,
  removing `web/` from the release order, retiring the `web` pin in
  `components.json`). That is a separate plan with its own gates around
  user notification, search-engine deindexing of the public landing's
  references, and CDN cache invalidation.
- v4 hard-enforcement of tier policy. The cutover is independent — v3.0
  desktop is the renderer being promoted; tier enforcement is a daemon-side
  v4 concern.
- Embedded daemon vs. external daemon decision for the shipped Tauri build.
  That decision is upstream of this checklist and gates §1.3 and §3.

Treat anything outside §1–§5 as the next plan's responsibility, not a Phase 6
omission.
