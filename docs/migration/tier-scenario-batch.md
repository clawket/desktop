# Tier / scenario / batch metadata exposure

Snapshot: 2026-05-14. This document is the runbook for surfacing `tier`,
`scenario_id` (and the sibling QA fields), and `batch_id` in the v3.0 Tauri
desktop renderer. A new view author should be able to read this once and know
exactly which field to consume, which default to apply, and which design
primitive to render it through.

## 1. Daemon contract

All three signals live on the `Task` entity. The daemon emits them as
optional JSON fields with `skip_serializing_if = "Option::is_none"`, so a
client must treat every field as nullable.

Rust source (`daemon/src/models.rs:438-462`):

```rust
// FIX-DAEMON-001: tier
#[serde(skip_serializing_if = "Option::is_none", default)]
pub tier: Option<String>,
// TIER-041: tier_used — the *executed* tier (vs declared `tier`).
// When tier_used != tier, an escalation_reason must accompany the change.
#[serde(skip_serializing_if = "Option::is_none", default)]
pub tier_used: Option<String>,
// TIER-043: escalation_reason — required when tier_used differs from tier.
#[serde(skip_serializing_if = "Option::is_none", default)]
pub escalation_reason: Option<String>,
// FIX-DAEMON-006: QA workflow fields
#[serde(skip_serializing_if = "Option::is_none", default)]
pub qa_status: Option<String>,
#[serde(skip_serializing_if = "Option::is_none", default)]
pub scenario_id: Option<String>,
#[serde(skip_serializing_if = "Option::is_none", default)]
pub defect_task: Option<String>,
#[serde(skip_serializing_if = "Option::is_none", default)]
pub scenario_amendment: Option<String>,
// US-CKT-SCHEMA-021: batch_id — ULID identifying the sub-agent batch invocation
#[serde(skip_serializing_if = "Option::is_none", default)]
pub batch_id: Option<String>,
```

The mirror TS DTO is in `desktop/apps/desktop/src/data/types.ts:81-89`:

```ts
tier?: Tier;
tier_used?: Tier;
escalation_reason?: string;
qa_status?: string;
scenario_id?: string;
defect_task?: string;
scenario_amendment?: string;
evidence?: string;
batch_id?: string;
```

`Tier` is `"low" | "med" | "high"` (`data/types.ts:19`). The string union is
authoritative — do not widen it client-side.

### Field meanings

| Field | Meaning | Cardinality |
| --- | --- | --- |
| `tier` | Declared tier when the task was created. Advisory in v3.0. | optional, one of `low`/`med`/`high` |
| `tier_used` | The tier the agent actually ran at. When `tier_used !== tier`, an `escalation_reason` is present. | optional |
| `escalation_reason` | Free text. Only meaningful if `tier_used !== tier`. | optional |
| `qa_status` | QA workflow state machine on top of `status`. | optional |
| `scenario_id` | ULID of the test scenario that produced this task (defect or amendment work). | optional |
| `defect_task` | If this task is a fix, the original defect task's ticket. | optional |
| `scenario_amendment` | Snapshot of the amendment text that produced this task. | optional |
| `batch_id` | ULID identifying a sub-agent batch invocation. Used to group tasks that ran together. | optional |

### v3.0 enforcement posture

In v3.0 these fields are **advisory** — the daemon emits them, the renderer
surfaces what is useful, but no constraint is enforced beyond `EVIDENCE_REQUIRED`
on `task.status=done` (which is unrelated). The plan record on file states v4
will hard-enforce tier policy; the desktop renderer should not pre-enforce.

## 2. View-side adapter helpers

Every view that consumes tasks duplicates a small set of pure helpers. This is
intentional — the helpers are trivial and the duplication keeps each view
self-contained for code review. If a fourth view needs them, lift to
`apps/desktop/src/data/taskAdapters.ts`; don't lift sooner.

```ts
// Defined inline in views/BacklogView.tsx:14, views/BoardView.tsx:13,
// views/PlansView.tsx:17, views/SummaryView.tsx:27
const DEFAULT_TIER: Tier = "med";

function taskTicket(t: Task): string {
  return t.ticket_number ?? t.id;
}

function taskAgent(t: Task): string {
  return t.assignee ?? t.agent_id ?? "unassigned";
}

function taskTier(t: Task): Tier {
  return (t.tier as Tier | undefined) ?? DEFAULT_TIER;
}
```

### `taskTicket` — `ticket_number ?? id`

`ticket_number` is the human-readable form (`LM-10900`). Older tasks
created before the ticket sequencer existed have `ticket_number: null`. Falling
back to `id` (the ULID `TASK-01KRJJ…`) keeps every row addressable. The
fallback is not cosmetic — the palette's task lookups and the `data-path`
attribute on Wiki rows both rely on a stable string.

### `taskAgent` — `assignee ?? agent_id ?? "unassigned"`

- `assignee` is the human/team owner.
- `agent_id` is the bound sub-agent (e.g. `@main`).
- The literal `"unassigned"` is the visible string; it is also the filter key
  in `BacklogView`'s assignee chip set, so do not localize it without updating
  the filter contract.

### `taskTier` — `(tier as Tier | undefined) ?? DEFAULT_TIER`

`DEFAULT_TIER = "med"` mirrors the daemon's own default surface (a task created
without an explicit `--tier` flag is treated as `med` downstream). The cast
through `Tier | undefined` is defensive: the wire field is a `string`, but the
client-side enum is narrower. If the daemon ever emits a value outside the
union, this cast lets TypeScript narrow it cleanly and the render path falls
through to the default styling.

## 3. Where each field is rendered today

| View | tier | scenario_id / QA fields | batch_id |
| --- | --- | --- | --- |
| `views/PlansView.tsx` | `TierMark` in each unit's task row (`:317`) and in the inspector via `TaskCard` (`:342-343`) | Not surfaced | Not surfaced |
| `views/BoardView.tsx` | `TierMark` via `TaskCard tier={taskTier(t)}` (`:136-137`) | Not surfaced | Not surfaced |
| `views/BacklogView.tsx` | `TierMark` via `TaskCard` (`:317`); also drives the `filter-tier-{low\|med\|high}` chip set (`:260-262`) | Not surfaced | Not surfaced |
| `views/SummaryView.tsx` | `TierMark showPrefix` on the active-task callout (`:94`) | Not surfaced | Not surfaced |
| `views/TimelineView.tsx` | Not surfaced | Not surfaced | Not surfaced |
| `views/WikiView.tsx` | Not surfaced (wiki entries are `Knowledge`, not `Task`) | n/a | n/a |

The `@clawket/ui` exports involved:

- `TierMark` — visual indicator. Variants `low`/`med`/`high` with a `showPrefix`
  option that prefixes the tier name. Used by `TaskCard` internally and by
  `SummaryView` standalone.
- `AgentTag` — assignee/agent chip. Used by `TaskCard` and `PlansView`.
- `TaskCard` — composes `StatusPill` + `TierMark` + `AgentTag` + optional
  `EvidenceChip` into one row. `tier`, `agent`, and `hasEvidence` are optional
  props; pass them when the field is meaningful and the view wants the
  signal visible.

## 4. Intentionally not rendered

- **Timeline** — events carry `entity_title`, `actor`, and a `detail` bag, not
  the full Task object. The `detail.ticket` short-form is shown, but tier/
  scenario/batch would require a second roundtrip to fetch the task; v3.0
  keeps the timeline as a streaming surface and defers that lookup.
- **Wiki** — operates over `Knowledge` entries, which don't carry tier or
  scenario_id. The QA scenario surface for wiki entries is a future plan.
- **Summary** — tier is shown only on the active-task callout, not on the
  list of recent tasks. Adding tier to every row would visually compete with
  the status pill that is the row's primary signal; the active-task callout
  is the one place where the tier decision matters most.
- **`tier_used` / `escalation_reason`** — surfaced nowhere in v3.0. The
  intended UX is a tooltip on `TierMark` when `tier_used !== tier`; the
  primitive doesn't accept a secondary value yet. Add the prop before adding
  the surface.
- **`qa_status` / `defect_task` / `scenario_amendment`** — surfaced nowhere
  in v3.0. The QA workflow has its own surface in the legacy web app; the
  Tauri renderer leaves that gap for a follow-up plan.
- **`batch_id`** — surfaced nowhere in v3.0. The intended UX is grouping
  on the Board / Backlog when a batch is in flight; the grouping primitive
  doesn't exist yet.

## 5. Adding a new view

When wiring a new view that needs any of these fields:

1. Import the adapter helpers inline (do not invent new fallbacks).
2. Render through `@clawket/ui` primitives — `TierMark`, `AgentTag`,
   `TaskCard`. Do not render tier values as raw strings.
3. If a field is genuinely irrelevant for your view, omit it. The "not
   surfaced" rows in §4 are deliberate, not deficiencies.
4. If a field is relevant but no primitive exists yet, add the primitive in
   `@clawket/ui` first (with a Storybook entry), then consume it. Never inline
   a tier badge in a view file.
