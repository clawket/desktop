// Wire DTOs that mirror the daemon's serialised JSON shapes.
// Source of truth: clawket/daemon/src/models.rs and routes/timeline.rs.
// All timestamps are ISO 8601 UTC strings ("2026-05-14T12:00:00.000Z").
// Optional fields use `T | null` where the daemon emits `Option<T>` without
// `skip_serializing_if`, and `T | undefined` (omitted) where it uses
// `skip_serializing_if = "Option::is_none"`. Treat both as nullable at
// consumption sites.

export type IsoTimestamp = string;

export type PlanStatus = "draft" | "active" | "completed";
export type CycleStatus = "planning" | "active" | "completed";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";
export type Tier = "low" | "med" | "high";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  key: string | null;
  enabled: number;
  wiki_paths: string[];
  cwds: string[];
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface Plan {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  source: string;
  source_path: string | null;
  created_at: IsoTimestamp;
  approved_at: IsoTimestamp | null;
  status: PlanStatus;
}

export interface Unit {
  id: string;
  plan_id: string;
  idx: number;
  title: string;
  goal: string | null;
  execution_mode: string;
  created_at: IsoTimestamp;
}

export interface Cycle {
  id: string;
  project_id: string;
  unit_id: string | null;
  idx: number;
  title: string;
  goal: string | null;
  created_at: IsoTimestamp;
  started_at: IsoTimestamp | null;
  ended_at: IsoTimestamp | null;
  status: CycleStatus;
}

export interface Task {
  id: string;
  unit_id: string;
  cycle_id: string | null;
  parent_task_id: string | null;
  ticket_number: string | null;
  idx: number;
  title: string;
  body: string;
  priority: string;
  complexity: string | null;
  estimated_edits: number | null;
  type: string;
  reporter: string | null;
  assignee: string | null;
  agent_id: string | null;
  created_at: IsoTimestamp;
  started_at: IsoTimestamp | null;
  completed_at: IsoTimestamp | null;
  status: TaskStatus;
  depends_on: string[];
  labels: string[];
  active_envelope_id?: string;
  atomic_size_hint: string;
  decomposition_policy: string;
  tier?: Tier;
  tier_used?: Tier;
  escalation_reason?: string;
  qa_status?: string;
  scenario_id?: string;
  defect_task?: string;
  scenario_amendment?: string;
  evidence?: string;
  batch_id?: string;
}

export interface Knowledge {
  id: string;
  task_id: string | null;
  unit_id: string | null;
  plan_id: string | null;
  type: string;
  title: string;
  content: string;
  content_format: string;
  parent_id: string | null;
  created_at: IsoTimestamp;
  wiki_idx?: number;
  wiki_depth?: number;
  decision_text?: string;
  outcome?: string;
}

/**
 * Filesystem wiki file metadata returned by `GET /wiki/files`. Distinct from
 * `Knowledge`: these are .md/.mdx files on disk under the project's
 * `wiki_paths`, not SQLite-backed knowledge entries. Used by WikiView for the
 * path-based tree; create/update/delete still flows through `/knowledge/*`.
 */
export interface WikiFile {
  /** Path relative to the project's cwd (e.g., "docs/api/auth.md"). */
  path: string;
  /** Filename without extension. */
  name: string;
  /** First `# Heading` from the file, or `name` when absent. */
  title: string;
  size: number;
  /** Epoch ms. */
  modified_at: number;
  /** The wiki_paths entry this file came from (e.g., "docs"), or "." for root-level files. */
  wiki_root: string;
}

export interface WikiFileContent {
  path: string;
  name: string;
  content: string;
  content_format: string;
  size: number;
  modified_at: number;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string;
  actor: string | null;
  created_at: number | null;
  detail: Record<string, unknown>;
}

/**
 * Task-scoped comment. Mirrors daemon `TaskComment` (models.rs::215).
 * Soft-delete: the daemon prefixes the body with `[DELETED] ` rather than
 * removing the row, so callers should detect that prefix when rendering.
 */
export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: IsoTimestamp;
}

/**
 * Human clarification / decision / blocker question. Mirrors daemon
 * `Question` (models.rs::228). `answer`/`answered_by`/`answered_at` are
 * populated once a user resolves the question via POST /questions/:id/answer.
 */
export type QuestionKind = "clarification" | "decision" | "blocker";
export type QuestionOrigin = "prompt" | "plan" | "review";

export interface Question {
  id: string;
  plan_id: string | null;
  unit_id: string | null;
  task_id: string | null;
  kind: string;
  origin: string;
  body: string;
  asked_by: string | null;
  created_at: IsoTimestamp;
  answer: string | null;
  answered_by: string | null;
  answered_at: IsoTimestamp | null;
}

/**
 * Task execution record. Mirrors daemon `Run` (models.rs::264). Usually
 * created by the Claude Code adapter on task start; the desktop renders them
 * read-only as history.
 */
export interface Run {
  id: string;
  task_id: string;
  session_id: string | null;
  agent: string;
  started_at: IsoTimestamp;
  ended_at: IsoTimestamp | null;
  result: string | null;
  notes: string | null;
  status: string;
  envelope_id?: string;
  envelope_snapshot?: unknown;
}

export type AnyEntity = Plan | Unit | Cycle | Task | Knowledge;

/**
 * Decomposition response from `POST /tasks/:id/decompose`. Mirrors
 * `daemon::decomposition::suggest::DecompositionResult` JSON shape (LM-87).
 * The daemon derives `suggested_subtasks` from the resolved envelope's
 * `success_criteria`; `policy_violations` surfaces atomic-size /
 * decomposition-policy advisory failures.
 */
export interface DecompositionSuggestion {
  idx: number;
  title: string;
  rationale: string;
  scope_hint: string;
  inherited_envelope_keys: string[];
}

export interface DecompositionPolicyViolation {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface DecompositionResult {
  parent: { id: string; ticket_number: string | null; title: string };
  strategy: string;
  max_depth: number;
  existing_children_count: number;
  suggested_subtasks: DecompositionSuggestion[];
  policy_violations: DecompositionPolicyViolation[];
}
