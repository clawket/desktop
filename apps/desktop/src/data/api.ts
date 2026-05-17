// Daemon HTTP client used by the desktop renderer.
//
// Wire facts (see daemon/src/middleware/tcp_auth.rs):
//   - TCP listener requires either the `X-Clawket-Token` header or the
//     `clawket_session` cookie. The renderer (WebView) cannot read XDG cache,
//     so we pull the token through a Tauri command (`read_token`) and present
//     it as a header.
//   - Default bind is 127.0.0.1:19400. Override via VITE_CLAWKET_DAEMON_URL
//     for dev (the daemon may pick 19401+ if 19400 is taken).
//   - Error wire: `bail!("UPPER_SNAKE_CODE: msg")` is translated to a JSON
//     body of the shape `{ "error": "...", "code": "UPPER_SNAKE_CODE" }` with
//     the appropriate HTTP status. We surface `code` so callers can branch
//     without parsing message text.

import type {
  Cycle,
  DecompositionResult,
  Knowledge,
  Plan,
  Project,
  Question,
  Run,
  Task,
  TaskComment,
  TaskStatus,
  Tier,
  TimelineEvent,
  Unit,
  WikiFile,
  WikiFileContent,
} from "./types";

const DEFAULT_BASE_URL = "http://127.0.0.1:19400";

export interface DaemonClientOptions {
  baseUrl?: string;
  /** Async loader for the X-Clawket-Token value. */
  tokenLoader?: () => Promise<string>;
  /** Override fetch (test injection point). */
  fetchImpl?: typeof fetch;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  key?: string | null;
  enabled?: 0 | 1 | boolean;
  wiki_paths?: string[];
  cwds?: string[];
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  key?: string | null;
  enabled?: 0 | 1 | boolean;
  wiki_paths?: string[];
  cwds?: string[];
}

export interface ProjectDeleteResult {
  ok: boolean;
  deleted: string;
}

export interface CreatePlanInput {
  projectId: string;
  title: string;
  description?: string | null;
  source?: string;
  sourcePath?: string;
}

export interface UpdatePlanPatch {
  title?: string;
  description?: string | null;
  status?: "draft" | "active" | "completed";
}

export interface PlanDeleteResult {
  ok: boolean;
  deleted: string;
}

export interface CreateUnitInput {
  planId: string;
  title: string;
  goal?: string | null;
  idx?: number;
  executionMode?: string;
}

export interface UpdateUnitPatch {
  title?: string;
  /**
   * Three-state encoding mirrors the daemon: omit to leave unchanged,
   * pass `null` to clear, pass a string to set.
   */
  goal?: string | null;
  executionMode?: string;
}

export interface UnitDeleteResult {
  ok: boolean;
  deleted: string;
}

export interface CreateCycleInput {
  projectId: string;
  /** Required (PDD A4: Cycle ⊂ Unit). Daemon rejects empty with MISSING_UNIT_ID. */
  unitId: string;
  title: string;
  goal?: string | null;
  idx?: number;
}

export interface UpdateCyclePatch {
  title?: string;
  goal?: string | null;
  /**
   * Daemon rejects `status: "active"` when the cycle is in `planning` —
   * use `activateCycle()` (POST /cycles/:id/activate) instead so `started_at`
   * gets recorded. Direct `completed` PATCH is allowed but `completeCycle()`
   * (POST /cycles/:id/complete) is the canonical path because it sets
   * `ended_at` server-side.
   */
  status?: "planning" | "active" | "completed";
}

export interface CycleDeleteResult {
  ok: boolean;
  deleted: string;
}

/**
 * Task create payload. Mirrors the daemon's `POST /tasks` contract. The
 * daemon rejects creation without `cycle_id` (MISSING_CYCLE_ID) and without
 * `unit_id` (UNIT_REQUIRED). Both are surfaced as required fields here.
 */
export interface CreateTaskInput {
  unitId: string;
  cycleId: string;
  title: string;
  body?: string;
  priority?: string;
  assignee?: string;
  parentTaskId?: string;
  type?: string;
  tier?: Tier;
  labels?: string[];
}

/**
 * Task PATCH payload. The daemon accepts a free-form JSON object; only the
 * fields exposed here are supported by the desktop today.
 *
 * Three-state encoding (omit / null / string) follows the existing pattern:
 *   - `key` absent → leave unchanged
 *   - `key: null` → clear (only meaningful for nullable columns like
 *     `assignee`, `evidence`, `body`)
 *   - `key: <value>` → set
 *
 * `status: "done"` is gated by the daemon's `EVIDENCE_REQUIRED` check
 * (HTTP 400 + code `EVIDENCE_REQUIRED`); callers must include a non-empty
 * `evidence` in the same patch.
 */
export interface UpdateTaskPatch {
  title?: string;
  body?: string | null;
  status?: TaskStatus;
  priority?: string;
  assignee?: string | null;
  tier?: Tier;
  labels?: string[];
  evidence?: string | null;
  estimatedEdits?: number | null;
  /**
   * Move semantics: re-parent to another task (or clear with `null`), move to
   * a different unit, or move to a different cycle. The daemon validates the
   * referenced rows exist and that any cycle change does not violate
   * unit/cycle invariants.
   */
  parentTaskId?: string | null;
  unitId?: string;
  cycleId?: string | null;
  /** Sidecar audit comment attached to this PATCH (daemon's `_comment`). */
  comment?: string;
}

/**
 * Daemon `DELETE /tasks/:id` returns one of:
 *   - `{ ok: true, deleted: "<id>" }` when the row was hard-deleted (task was
 *     `todo` in a `draft` plan).
 *   - the updated Task object when the task was instead transitioned to
 *     `cancelled` (any other state).
 *
 * The desktop's `deleteTask` always resolves to `void` — call sites refetch
 * the list afterwards, so the exact wire shape isn't surfaced upward.
 */
export interface DeleteTaskOptions {
  /** Cancellation comment; daemon defaults to "Cancelled via delete" if omitted. */
  reason?: string;
}

/**
 * Decomposition request — POST /tasks/:id/decompose. Daemon derives subtasks
 * from the resolved envelope's `success_criteria`. `strategy` and `max_depth`
 * are advisory hints; the daemon owns the actual derivation policy (LM-87).
 */
export interface DecomposeTaskArgs {
  strategy?: "auto" | "scoped" | "by-repo";
  max_depth?: number;
}

/**
 * Subtask create payload — POST /tasks/:parent/subtasks. The daemon inherits
 * `unit_id`/`cycle_id` from the parent if omitted; the child's
 * `parent_task_id` is fixed by the path. All other fields mirror the
 * top-level `CreateTaskInput`.
 */
export interface CreateSubtaskInput {
  title: string;
  body?: string;
  priority?: string;
  assignee?: string;
  unitId?: string;
  cycleId?: string;
  type?: string;
}

/**
 * Comment author for desktop-originated comments. Mirrors the CLI default
 * (`clawket comment create --author main`). Future: surface a user pref so
 * authors can be attributed (e.g., the OS user).
 */
export const DEFAULT_COMMENT_AUTHOR = "main";

/**
 * Question asked_by default (mirrors CLI `--asked-by main`).
 */
export const DEFAULT_QUESTION_ASKED_BY = "main";

/**
 * Daemon soft-deletes comments by prefixing the body with this marker — the
 * row stays in the table to preserve thread continuity. Renderers strip the
 * marker and gray out the entry.
 */
export const COMMENT_SOFT_DELETED_PREFIX = "[DELETED]";

export interface CreateCommentInput {
  body: string;
  author?: string;
}

export interface CreateQuestionInput {
  taskId: string;
  body: string;
  kind?: string;
  origin?: string;
  askedBy?: string;
}

export interface AnswerQuestionInput {
  answer: string;
  answeredBy?: string;
}

export interface CreateKnowledgeInput {
  type: string;
  title: string;
  taskId?: string;
  unitId?: string;
  planId?: string;
  content?: string;
  contentFormat?: string;
  parentId?: string;
}

export interface UpdateKnowledgePatch {
  title?: string;
  content?: string;
  contentFormat?: string;
  createdBy?: string;
  wikiIdx?: number;
  /**
   * Reparent semantics: `null` clears the parent, a string sets it, omitted
   * key leaves it unchanged. Mirrors the daemon's three-state encoding for
   * `parent_id` (Option<Value>: None | Null | String).
   */
  parentId?: string | null;
}

export interface KnowledgeDeleteResult {
  ok: boolean;
  deleted: string;
  soft: boolean;
}

export interface KnowledgeHit extends Knowledge {
  bm25_score?: number;
  vector_score?: number;
  hybrid_score?: number;
  truncated?: boolean;
}

export interface KnowledgeSearchResponse {
  hits: KnowledgeHit[];
  total_returned: number;
  limit: number;
  truncated: boolean;
}

export interface KnowledgeImportItem {
  id?: string;
  path: string;
  title: string;
}

export interface KnowledgeImportSkipped {
  path: string;
  title: string;
  reason: string;
}

export interface KnowledgeImportResult {
  imported: number;
  skipped: number;
  items: KnowledgeImportItem[];
  /** Daemon emits this with `#[serde(rename = "skippedItems")]`. */
  skippedItems: KnowledgeImportSkipped[];
  dry_run: boolean;
}

export class DaemonError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;

  constructor(
    message: string,
    status: number,
    code: string | null,
    body: unknown,
  ) {
    super(message);
    this.name = "DaemonError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function resolveBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_CLAWKET_DAEMON_URL;
  if (url && url.trim().length > 0) return url.replace(/\/+$/, "");
  return DEFAULT_BASE_URL;
}

/**
 * Default token loader. Invokes the Rust `read_token` command. In tests or
 * during web-only `dev:vite` (no Tauri runtime), `window.__TAURI__` is absent
 * so we fall back to an empty token — the daemon will reject the request and
 * the caller surfaces the auth error to the UI.
 */
export async function defaultTokenLoader(): Promise<string> {
  type TauriHost = {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  const host = globalThis as unknown as TauriHost;
  if (!host.__TAURI__ && !host.__TAURI_INTERNALS__) return "";
  const mod = await import("@tauri-apps/api/core");
  return await mod.invoke<string>("read_token");
}

export class DaemonClient {
  readonly baseUrl: string;
  private readonly tokenLoader: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private cachedToken: string | null = null;

  constructor(opts: DaemonClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? resolveBaseUrl()).replace(/\/+$/, "");
    this.tokenLoader = opts.tokenLoader ?? defaultTokenLoader;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** Drop the cached token. Call after a 401 to force the next call to reload. */
  invalidateToken(): void {
    this.cachedToken = null;
  }

  private async token(): Promise<string> {
    if (this.cachedToken !== null) return this.cachedToken;
    const t = await this.tokenLoader();
    this.cachedToken = t;
    return t;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const token = await this.token();
    const headers = new Headers(init.headers);
    if (token) headers.set("X-Clawket-Token", token);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Accept", "application/json");

    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (e) {
      throw new DaemonError(
        `network error: ${(e as Error).message}`,
        0,
        null,
        null,
      );
    }

    if (resp.status === 401) this.invalidateToken();

    const text = await resp.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!resp.ok) {
      const code =
        body && typeof body === "object" && "code" in body
          ? ((body as { code: unknown }).code as string | null)
          : null;
      const message =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${resp.status}`;
      throw new DaemonError(message, resp.status, code, body);
    }
    return body as T;
  }

  // ---- Health ----------------------------------------------------------
  /**
   * Pings GET /health with a short timeout. Returns true on 2xx, false on any
   * non-ok response or transport failure. Does not throw — health polling is
   * a soft-fail signal driving the daemon-health pill in Topbar.
   */
  async health(timeoutMs = 3000): Promise<boolean> {
    try {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
      try {
        const resp = await this.fetchImpl(`${this.baseUrl}/health`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller?.signal,
        });
        return resp.ok;
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  // ---- Projects --------------------------------------------------------
  listProjects(): Promise<Project[]> {
    return this.request<Project[]>("/projects");
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    const body: Record<string, unknown> = { name: input.name };
    if (input.description !== undefined) body.description = input.description;
    if (input.key !== undefined) body.key = input.key;
    if (input.enabled !== undefined) {
      body.enabled =
        typeof input.enabled === "boolean"
          ? input.enabled
            ? 1
            : 0
          : input.enabled;
    }
    if (input.wiki_paths !== undefined) body.wiki_paths = input.wiki_paths;
    if (input.cwds !== undefined) body.cwds = input.cwds;
    return this.request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateProject(id: string, patch: UpdateProjectPatch): Promise<Project> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.key !== undefined) body.key = patch.key;
    if (patch.enabled !== undefined) {
      body.enabled =
        typeof patch.enabled === "boolean"
          ? patch.enabled
            ? 1
            : 0
          : patch.enabled;
    }
    if (patch.wiki_paths !== undefined) body.wiki_paths = patch.wiki_paths;
    if (patch.cwds !== undefined) body.cwds = patch.cwds;
    return this.request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteProject(id: string): Promise<ProjectDeleteResult> {
    return this.request<ProjectDeleteResult>(
      `/projects/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  // ---- Plans -----------------------------------------------------------
  listPlans(projectId?: string): Promise<Plan[]> {
    const qs = projectId
      ? `?project_id=${encodeURIComponent(projectId)}`
      : "";
    return this.request<Plan[]>(`/plans${qs}`);
  }
  getPlan(id: string): Promise<Plan> {
    return this.request<Plan>(`/plans/${encodeURIComponent(id)}`);
  }

  createPlan(input: CreatePlanInput): Promise<Plan> {
    const body: Record<string, unknown> = {
      project_id: input.projectId,
      title: input.title,
    };
    if (input.description !== undefined) body.description = input.description;
    if (input.source !== undefined) body.source = input.source;
    if (input.sourcePath !== undefined) body.source_path = input.sourcePath;
    return this.request<Plan>("/plans", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updatePlan(id: string, patch: UpdatePlanPatch): Promise<Plan> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.status !== undefined) body.status = patch.status;
    return this.request<Plan>(`/plans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * Approve a draft plan. Daemon enforces "one active plan per project" so
   * this transitions the plan to `active` and (if another plan was active)
   * the previously-active plan reverts. Idempotent — calling on an already
   * active plan is a no-op.
   */
  approvePlan(id: string): Promise<Plan> {
    return this.request<Plan>(
      `/plans/${encodeURIComponent(id)}/approve`,
      { method: "POST" },
    );
  }

  /**
   * Mark an active plan as completed. There is no `/complete` sub-path on the
   * daemon — completion is expressed as a status PATCH. Irreversible: a
   * completed plan cannot be reactivated (the user must create a new plan).
   */
  completePlan(id: string): Promise<Plan> {
    return this.updatePlan(id, { status: "completed" });
  }

  deletePlan(id: string): Promise<PlanDeleteResult> {
    return this.request<PlanDeleteResult>(
      `/plans/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  // ---- Units -----------------------------------------------------------
  listUnits(planId?: string): Promise<Unit[]> {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    return this.request<Unit[]>(`/units${qs}`);
  }

  getUnit(id: string): Promise<Unit> {
    return this.request<Unit>(`/units/${encodeURIComponent(id)}`);
  }

  createUnit(input: CreateUnitInput): Promise<Unit> {
    const body: Record<string, unknown> = {
      plan_id: input.planId,
      title: input.title,
    };
    if (input.goal !== undefined) body.goal = input.goal;
    if (input.idx !== undefined) body.idx = input.idx;
    if (input.executionMode !== undefined) {
      body.execution_mode = input.executionMode;
    }
    return this.request<Unit>("/units", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH /units/:id. Daemon uses three-state encoding for `goal`: omit to
   * leave unchanged, pass `null` to clear, pass a string to set.
   * `execution_mode` is two-state (string-only) — pass `undefined` to skip.
   */
  updateUnit(id: string, patch: UpdateUnitPatch): Promise<Unit> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if ("goal" in patch) body.goal = patch.goal;
    if (patch.executionMode !== undefined) {
      body.execution_mode = patch.executionMode;
    }
    return this.request<Unit>(`/units/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteUnit(id: string): Promise<UnitDeleteResult> {
    return this.request<UnitDeleteResult>(
      `/units/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  // ---- Cycles ----------------------------------------------------------
  listCycles(opts: {
    projectId?: string;
    unitId?: string;
  } = {}): Promise<Cycle[]> {
    const params = new URLSearchParams();
    if (opts.projectId) params.set("project_id", opts.projectId);
    if (opts.unitId) params.set("unit_id", opts.unitId);
    const qs = params.toString();
    return this.request<Cycle[]>(`/cycles${qs ? `?${qs}` : ""}`);
  }

  getCycle(id: string): Promise<Cycle> {
    return this.request<Cycle>(`/cycles/${encodeURIComponent(id)}`);
  }

  createCycle(input: CreateCycleInput): Promise<Cycle> {
    const body: Record<string, unknown> = {
      project_id: input.projectId,
      unit_id: input.unitId,
      title: input.title,
    };
    if (input.goal !== undefined) body.goal = input.goal;
    if (input.idx !== undefined) body.idx = input.idx;
    return this.request<Cycle>("/cycles", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH /cycles/:id. `goal` uses three-state encoding (omit / null / string).
   * Do not set `status: "active"` via PATCH when the cycle is in `planning` —
   * the daemon rejects it with "Use POST /cycles/:id/activate"; call
   * `activateCycle()` instead so `started_at` is recorded server-side.
   */
  updateCycle(id: string, patch: UpdateCyclePatch): Promise<Cycle> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if ("goal" in patch) body.goal = patch.goal;
    if (patch.status !== undefined) body.status = patch.status;
    return this.request<Cycle>(`/cycles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * Activate a planning cycle. Daemon enforces "one active cycle per unit" so
   * this transitions the cycle to `active` and records `started_at`. A unit's
   * previously-active cycle is implicitly unaffected (the daemon does not
   * auto-complete it — the caller must complete it first if needed).
   * Idempotent on an already-active cycle.
   */
  activateCycle(id: string): Promise<Cycle> {
    return this.request<Cycle>(
      `/cycles/${encodeURIComponent(id)}/activate`,
      { method: "POST" },
    );
  }

  /**
   * Mark a cycle as completed (sets `ended_at` server-side). Irreversible: a
   * completed cycle cannot be reactivated (the user must create a new cycle).
   */
  completeCycle(id: string): Promise<Cycle> {
    return this.request<Cycle>(
      `/cycles/${encodeURIComponent(id)}/complete`,
      { method: "POST" },
    );
  }

  deleteCycle(id: string): Promise<CycleDeleteResult> {
    return this.request<CycleDeleteResult>(
      `/cycles/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  // ---- Tasks -----------------------------------------------------------
  listTasks(opts: {
    planId?: string;
    unitId?: string;
    cycleId?: string;
    status?: TaskStatus;
  } = {}): Promise<Task[]> {
    const params = new URLSearchParams();
    if (opts.planId) params.set("plan_id", opts.planId);
    if (opts.unitId) params.set("unit_id", opts.unitId);
    if (opts.cycleId) params.set("cycle_id", opts.cycleId);
    if (opts.status) params.set("status", opts.status);
    const qs = params.toString();
    return this.request<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
  }

  getTask(id: string): Promise<Task> {
    return this.request<Task>(`/tasks/${encodeURIComponent(id)}`);
  }

  /**
   * The daemon wraps the created Task with an `active_envelope` sidecar
   * (`TaskWithEnvelope`). We only need the Task fields here, so we narrow the
   * response. Test mocks can return either shape.
   */
  createTask(input: CreateTaskInput): Promise<Task> {
    const body: Record<string, unknown> = {
      unit_id: input.unitId,
      cycle_id: input.cycleId,
      title: input.title,
    };
    if (input.body !== undefined) body.body = input.body;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.assignee !== undefined) body.assignee = input.assignee;
    if (input.parentTaskId !== undefined) body.parent_task_id = input.parentTaskId;
    if (input.type !== undefined) body.type = input.type;
    if (input.tier !== undefined) body.tier = input.tier;
    if (input.labels !== undefined) body.labels = input.labels;
    return this.request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH /tasks/:id. Three-state encoding for nullable fields:
   *   - omit the key → leave the column unchanged
   *   - `key: null`  → clear (only valid for assignee / body / evidence /
   *                     estimated_edits)
   *   - `key: <v>`   → set
   *
   * The daemon enforces `EVIDENCE_REQUIRED` on `status: "done"` (HTTP 400 +
   * code `EVIDENCE_REQUIRED`); supply `evidence` in the same patch.
   */
  updateTask(id: string, patch: UpdateTaskPatch): Promise<Task> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if ("body" in patch) body.body = patch.body;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if ("assignee" in patch) body.assignee = patch.assignee;
    if (patch.tier !== undefined) body.tier = patch.tier;
    if (patch.labels !== undefined) body.labels = patch.labels;
    if ("evidence" in patch) body.evidence = patch.evidence;
    if ("estimatedEdits" in patch) body.estimated_edits = patch.estimatedEdits;
    if ("parentTaskId" in patch) body.parent_task_id = patch.parentTaskId;
    if (patch.unitId !== undefined) body.unit_id = patch.unitId;
    if ("cycleId" in patch) body.cycle_id = patch.cycleId;
    if (patch.comment !== undefined && patch.comment.length > 0) {
      body._comment = patch.comment;
    }
    return this.request<Task>(`/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * POST /tasks/:id/decompose. Returns the daemon's suggestion list derived
   * from the resolved envelope's `success_criteria`. The same shape the CLI
   * MCP `clawket_decompose_task` tool exposes — daemon is the single source
   * of truth (LM-87).
   */
  decomposeTask(
    id: string,
    args: DecomposeTaskArgs = {},
  ): Promise<DecompositionResult> {
    return this.request<DecompositionResult>(
      `/tasks/${encodeURIComponent(id)}/decompose`,
      { method: "POST", body: JSON.stringify(args) },
    );
  }

  /**
   * POST /tasks/:parent/subtasks. Inherits `unit_id`/`cycle_id` from the
   * parent unless overridden in the body. The daemon returns a
   * `TaskWithEnvelope` shape; we narrow to `Task` here.
   */
  createSubtask(parentId: string, input: CreateSubtaskInput): Promise<Task> {
    const body: Record<string, unknown> = { title: input.title };
    if (input.body !== undefined) body.body = input.body;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.assignee !== undefined) body.assignee = input.assignee;
    if (input.unitId !== undefined) body.unit_id = input.unitId;
    if (input.cycleId !== undefined) body.cycle_id = input.cycleId;
    if (input.type !== undefined) body.type = input.type;
    const raw = this.request<Task | { task: Task }>(
      `/tasks/${encodeURIComponent(parentId)}/subtasks`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return raw.then((res) =>
      res && typeof res === "object" && "task" in res
        ? (res as { task: Task }).task
        : (res as Task),
    );
  }

  /**
   * DELETE /tasks/:id. The daemon either hard-deletes (todo task in draft
   * plan) or transitions to `cancelled` with a system comment. The response
   * shape differs accordingly; we discard it here — callers refetch.
   */
  deleteTask(id: string, opts: DeleteTaskOptions = {}): Promise<void> {
    const init: RequestInit = { method: "DELETE" };
    const reason = opts.reason?.trim();
    if (reason && reason.length > 0) {
      init.body = JSON.stringify({ reason });
    }
    return this.request<void>(`/tasks/${encodeURIComponent(id)}`, init);
  }

  // ---- Comments --------------------------------------------------------
  //
  // Task-scoped only. Daemon explicitly rejects unit/plan comments (the
  // schema only stores task_comments). PATCH/DELETE are mounted at
  // /comments/:id (not /tasks/:tid/comments/:cid).
  //
  // DELETE is soft: the row stays, body becomes `[DELETED] <original>` so
  // thread continuity is preserved. Renderers must detect the prefix.

  listComments(taskId: string): Promise<TaskComment[]> {
    return this.request<TaskComment[]>(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
    );
  }

  createComment(taskId: string, input: CreateCommentInput): Promise<TaskComment> {
    const body = {
      author: input.author ?? DEFAULT_COMMENT_AUTHOR,
      body: input.body,
    };
    return this.request<TaskComment>(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  updateComment(id: string, body: string): Promise<TaskComment> {
    return this.request<TaskComment>(`/comments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  }

  /**
   * Soft-delete. Daemon prefixes body with `[DELETED] ` and returns
   * `{ ok: true, soft_deleted: "<id>" }`. We discard the wire shape — the
   * caller refetches the list.
   */
  deleteComment(id: string): Promise<void> {
    return this.request<void>(`/comments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // ---- Runs ------------------------------------------------------------
  //
  // Read-only from the desktop. Runs are created and finished by the Claude
  // Code adapter on task start/stop. We surface a filtered list so the
  // TaskDetail panel can render history.

  listRuns(opts: { taskId?: string; projectId?: string } = {}): Promise<Run[]> {
    const params = new URLSearchParams();
    if (opts.taskId) params.set("task_id", opts.taskId);
    if (opts.projectId) params.set("project_id", opts.projectId);
    const qs = params.toString();
    return this.request<Run[]>(`/runs${qs ? `?${qs}` : ""}`);
  }

  /**
   * GET /cycles/:id/tasks — tasks scoped to a single cycle. Distinct from
   * `listTasks({ cycleId })`: the daemon's `/cycles/:id/tasks` is what the
   * web's TimelineView calls to compute cycle progress against the active
   * cycle. Returned tasks share the Task wire shape.
   */
  listCycleTasks(cycleId: string): Promise<Task[]> {
    return this.request<Task[]>(
      `/cycles/${encodeURIComponent(cycleId)}/tasks`,
    );
  }

  // ---- Questions -------------------------------------------------------
  //
  // Task-scoped surface in the desktop. Questions can also attach to plans /
  // units, but the TaskDetail panel only consumes the per-task list.

  listQuestions(opts: { taskId?: string; pending?: boolean } = {}): Promise<
    Question[]
  > {
    const params = new URLSearchParams();
    if (opts.taskId) params.set("task_id", opts.taskId);
    if (opts.pending !== undefined) params.set("pending", String(opts.pending));
    const qs = params.toString();
    return this.request<Question[]>(`/questions${qs ? `?${qs}` : ""}`);
  }

  createQuestion(input: CreateQuestionInput): Promise<Question> {
    const body: Record<string, unknown> = {
      task_id: input.taskId,
      body: input.body,
    };
    if (input.kind !== undefined) body.kind = input.kind;
    if (input.origin !== undefined) body.origin = input.origin;
    body.asked_by = input.askedBy ?? DEFAULT_QUESTION_ASKED_BY;
    return this.request<Question>("/questions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  answerQuestion(id: string, input: AnswerQuestionInput): Promise<Question> {
    const body: Record<string, unknown> = { answer: input.answer };
    if (input.answeredBy !== undefined) body.answered_by = input.answeredBy;
    return this.request<Question>(
      `/questions/${encodeURIComponent(id)}/answer`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  // ---- Knowledge -------------------------------------------------------
  listKnowledge(opts: {
    projectId?: string;
    planId?: string;
    unitId?: string;
    taskId?: string;
    type?: string;
  } = {}): Promise<Knowledge[]> {
    const params = new URLSearchParams();
    if (opts.projectId) params.set("project", opts.projectId);
    if (opts.planId) params.set("plan_id", opts.planId);
    if (opts.unitId) params.set("unit_id", opts.unitId);
    if (opts.taskId) params.set("task_id", opts.taskId);
    if (opts.type) params.set("type", opts.type);
    const qs = params.toString();
    return this.request<Knowledge[]>(`/knowledge${qs ? `?${qs}` : ""}`);
  }

  getKnowledge(id: string): Promise<Knowledge> {
    return this.request<Knowledge>(`/knowledge/${encodeURIComponent(id)}`);
  }

  createKnowledge(input: CreateKnowledgeInput): Promise<Knowledge> {
    const body: Record<string, unknown> = {
      type: input.type,
      title: input.title,
    };
    if (input.taskId !== undefined) body.task_id = input.taskId;
    if (input.unitId !== undefined) body.unit_id = input.unitId;
    if (input.planId !== undefined) body.plan_id = input.planId;
    if (input.content !== undefined) body.content = input.content;
    if (input.contentFormat !== undefined) body.content_format = input.contentFormat;
    if (input.parentId !== undefined) body.parent_id = input.parentId;
    return this.request<Knowledge>("/knowledge", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH /knowledge/:id. The daemon distinguishes "key omitted" (leave parent
   * unchanged) from "key=null" (clear parent). To express the clear-intent we
   * accept `parentId: null` and pass through as JSON `null`; omit the key
   * entirely to leave it unchanged.
   */
  updateKnowledge(id: string, patch: UpdateKnowledgePatch): Promise<Knowledge> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.content !== undefined) body.content = patch.content;
    if (patch.contentFormat !== undefined) body.content_format = patch.contentFormat;
    if (patch.createdBy !== undefined) body.created_by = patch.createdBy;
    if (patch.wikiIdx !== undefined) body.wiki_idx = patch.wikiIdx;
    if ("parentId" in patch) body.parent_id = patch.parentId;
    return this.request<Knowledge>(`/knowledge/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteKnowledge(id: string): Promise<KnowledgeDeleteResult> {
    return this.request<KnowledgeDeleteResult>(
      `/knowledge/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  searchKnowledge(opts: {
    q: string;
    mode?: "keyword" | "semantic" | "hybrid";
    limit?: number;
    projectId?: string;
  }): Promise<KnowledgeSearchResponse> {
    const params = new URLSearchParams();
    params.set("q", opts.q);
    if (opts.mode) params.set("mode", opts.mode);
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.projectId) params.set("project_id", opts.projectId);
    return this.request<KnowledgeSearchResponse>(
      `/knowledge/search?${params.toString()}`,
    );
  }

  importKnowledge(input: {
    cwd: string;
    planId?: string;
    unitId?: string;
    projectId?: string;
    dryRun?: boolean;
  }): Promise<KnowledgeImportResult> {
    const body: Record<string, unknown> = { cwd: input.cwd };
    if (input.planId !== undefined) body.plan_id = input.planId;
    if (input.unitId !== undefined) body.unit_id = input.unitId;
    if (input.projectId !== undefined) body.project_id = input.projectId;
    if (input.dryRun !== undefined) body.dry_run = input.dryRun;
    return this.request<KnowledgeImportResult>("/knowledge/import", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  wikiTree(opts: { rootId?: string; planId?: string } = {}): Promise<Knowledge[]> {
    const params = new URLSearchParams();
    if (opts.rootId) params.set("root_id", opts.rootId);
    if (opts.planId) params.set("plan_id", opts.planId);
    const qs = params.toString();
    return this.request<Knowledge[]>(`/wiki/tree${qs ? `?${qs}` : ""}`);
  }

  // ---- Filesystem wiki (GET /wiki/files, GET /wiki/file) ---------------
  //
  // These read .md/.mdx files from disk under the project's wiki_paths.
  // Distinct surface from /knowledge — listKnowledge returns SQLite entries.
  // Returns [] when cwd is empty or does not exist (daemon behaviour); the
  // empty result is non-fatal so the view can render an empty hint.

  listWikiFiles(opts: { cwd: string; projectId?: string }): Promise<WikiFile[]> {
    const params = new URLSearchParams();
    params.set("cwd", opts.cwd);
    if (opts.projectId) params.set("project_id", opts.projectId);
    return this.request<WikiFile[]>(`/wiki/files?${params.toString()}`);
  }

  getWikiFile(opts: {
    cwd: string;
    path: string;
    projectId?: string;
  }): Promise<WikiFileContent> {
    const params = new URLSearchParams();
    params.set("cwd", opts.cwd);
    params.set("path", opts.path);
    if (opts.projectId) params.set("project_id", opts.projectId);
    return this.request<WikiFileContent>(`/wiki/file?${params.toString()}`);
  }

  // ---- Timeline --------------------------------------------------------
  listTimeline(
    projectId: string,
    opts: { limit?: number; offset?: number; types?: string[] } = {},
  ): Promise<TimelineEvent[]> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts.types && opts.types.length > 0) {
      params.set("types", opts.types.join(","));
    }
    const qs = params.toString();
    return this.request<TimelineEvent[]>(
      `/projects/${encodeURIComponent(projectId)}/timeline${
        qs ? `?${qs}` : ""
      }`,
    );
  }
}

/** Shared singleton for the renderer. */
let _client: DaemonClient | null = null;
export function getDaemonClient(): DaemonClient {
  if (!_client) _client = new DaemonClient();
  return _client;
}

// Test seam: lets tests substitute a fresh client.
export function _resetDaemonClient(c: DaemonClient | null = null): void {
  _client = c;
}
