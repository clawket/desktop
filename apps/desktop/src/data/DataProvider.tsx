// Single DataProvider for the renderer. Wraps the AppShell and:
//   1. Performs parallel initial fetches against the daemon (plans, units,
//      cycles, tasks, timeline, knowledge) on mount.
//   2. Subscribes to /events SSE via useEvents. On a non-deleted lifecycle
//      event, refetches the relevant entity list (the daemon payload is
//      `{id}` only — see daemon/src/routes/tasks.rs and friends — so a single
//      typed refetch is cheaper than reconstructing the entity from the
//      event). On a `*:deleted` event, removes the entity locally without
//      hitting the network.
//   3. Exposes a typed Context so all 6 views consume one source of truth.
//
// The reducer is pure; all side-effects live in the provider's effect.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  DaemonClient,
  getDaemonClient,
  type AnswerQuestionInput,
  type CreateCommentInput,
  type CreateCycleInput,
  type CreatePlanInput,
  type CreateProjectInput,
  type CreateQuestionInput,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type CreateUnitInput,
  type DecomposeTaskArgs,
  type UpdateCyclePatch,
  type UpdatePlanPatch,
  type UpdateProjectPatch,
  type UpdateTaskPatch,
  type UpdateUnitPatch,
} from "./api";
import {
  parseEventName,
  useEvents,
  type DaemonEvent,
  type SseEntityType,
  type UseEventsState,
} from "./hooks/useEvents";
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
  TimelineEvent,
  Unit,
  WikiFile,
} from "./types";

export type DataStatus = "idle" | "loading" | "ready" | "error";

const ACTIVE_PROJECT_STORAGE_KEY = "clawket.activeProjectId";

export interface DataState {
  status: DataStatus;
  error: string | null;
  projects: Project[];
  activeProjectId: string | null;
  plans: Plan[];
  units: Unit[];
  cycles: Cycle[];
  tasks: Task[];
  knowledge: Knowledge[];
  timeline: TimelineEvent[];
  /**
   * Filesystem .md/.mdx files under the active project's wiki_paths. Empty
   * when the project has no registered cwd. Refetched on `knowledge:*` SSE
   * events because import/export sync between disk and knowledge entries.
   */
  wikiFiles: WikiFile[];
  /**
   * Project-scoped runs (agent execution history). Populated on initial fetch
   * and refetched on `task:*` SSE events because runs are created/closed in
   * response to task lifecycle transitions. Used by TimelineView's swimlane
   * to render per-agent vertical tracks. Soft-failed on fetch error so the
   * rest of the dashboard renders when /runs is unavailable.
   */
  runs: Run[];
  sse: UseEventsState;
}

type Action =
  | { type: "INIT_START" }
  | {
      type: "INIT_LOADED";
      projects: Project[];
      activeProjectId: string | null;
      plans: Plan[];
      units: Unit[];
      cycles: Cycle[];
      tasks: Task[];
      knowledge: Knowledge[];
      timeline: TimelineEvent[];
      wikiFiles: WikiFile[];
      runs: Run[];
    }
  | { type: "INIT_ERROR"; message: string }
  | { type: "SET_ACTIVE_PROJECT"; id: string | null }
  | { type: "UPSERT_PROJECTS"; items: Project[] }
  | { type: "UPSERT_PLANS"; items: Plan[] }
  | { type: "UPSERT_UNITS"; items: Unit[] }
  | { type: "UPSERT_CYCLES"; items: Cycle[] }
  | { type: "UPSERT_TASKS"; items: Task[] }
  | { type: "UPSERT_KNOWLEDGE"; items: Knowledge[] }
  | { type: "UPSERT_TIMELINE"; items: TimelineEvent[] }
  | { type: "UPSERT_WIKI_FILES"; items: WikiFile[] }
  | { type: "UPSERT_RUNS"; items: Run[] }
  | { type: "REMOVE"; entity: SseEntityType; id: string }
  | { type: "SSE_STATE"; sse: UseEventsState };

const INITIAL: DataState = {
  status: "idle",
  error: null,
  projects: [],
  activeProjectId: null,
  plans: [],
  units: [],
  cycles: [],
  tasks: [],
  knowledge: [],
  timeline: [],
  wikiFiles: [],
  runs: [],
  sse: { readyState: "connecting", lastEventId: null, error: null },
};

function reducer(state: DataState, action: Action): DataState {
  switch (action.type) {
    case "INIT_START":
      return { ...state, status: "loading", error: null };
    case "INIT_LOADED":
      return {
        ...state,
        status: "ready",
        error: null,
        projects: action.projects,
        activeProjectId: action.activeProjectId,
        plans: action.plans,
        units: action.units,
        cycles: action.cycles,
        tasks: action.tasks,
        knowledge: action.knowledge,
        timeline: action.timeline,
        wikiFiles: action.wikiFiles,
        runs: action.runs,
      };
    case "INIT_ERROR":
      return { ...state, status: "error", error: action.message };
    case "SET_ACTIVE_PROJECT":
      return { ...state, activeProjectId: action.id };
    case "UPSERT_PROJECTS":
      return { ...state, projects: action.items };
    case "UPSERT_PLANS":
      return { ...state, plans: action.items };
    case "UPSERT_UNITS":
      return { ...state, units: action.items };
    case "UPSERT_CYCLES":
      return { ...state, cycles: action.items };
    case "UPSERT_TASKS":
      return { ...state, tasks: action.items };
    case "UPSERT_KNOWLEDGE":
      return { ...state, knowledge: action.items };
    case "UPSERT_TIMELINE":
      return { ...state, timeline: action.items };
    case "UPSERT_WIKI_FILES":
      return { ...state, wikiFiles: action.items };
    case "UPSERT_RUNS":
      return { ...state, runs: action.items };
    case "REMOVE":
      return removeEntity(state, action.entity, action.id);
    case "SSE_STATE":
      return { ...state, sse: action.sse };
    default:
      return state;
  }
}

function removeEntity(
  state: DataState,
  entity: SseEntityType,
  id: string,
): DataState {
  switch (entity) {
    case "plan":
      return { ...state, plans: state.plans.filter((p) => p.id !== id) };
    case "unit":
      return { ...state, units: state.units.filter((u) => u.id !== id) };
    case "cycle":
      return { ...state, cycles: state.cycles.filter((c) => c.id !== id) };
    case "task":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
    case "knowledge":
      return {
        ...state,
        knowledge: state.knowledge.filter((k) => k.id !== id),
      };
    default:
      return state;
  }
}

export interface DataContextValue extends DataState {
  /** Force a full reload (network). */
  refresh: () => Promise<void>;
  /**
   * Ping daemon `/health` — returns true on 2xx. Soft-fails to false on any
   * transport / non-ok response. Used by `useDaemonHealth` to drive the
   * Topbar liveness pill (FIX-WEB-003 parity).
   */
  health: () => Promise<boolean>;
  /** Switch the active project. Persists to localStorage and refetches. */
  setActiveProject: (id: string) => void;
  /** Create a project via the daemon. Refreshes the project list on success. */
  createProject: (input: CreateProjectInput) => Promise<Project>;
  /** Update a project via the daemon. Refreshes the project list on success. */
  updateProject: (id: string, patch: UpdateProjectPatch) => Promise<Project>;
  /** Delete a project via the daemon. Refreshes the project list on success. */
  deleteProject: (id: string) => Promise<void>;
  /** Create a plan via the daemon. Refreshes the plan list on success. */
  createPlan: (input: CreatePlanInput) => Promise<Plan>;
  /** Update a plan via the daemon. Refreshes the plan list on success. */
  updatePlan: (id: string, patch: UpdatePlanPatch) => Promise<Plan>;
  /** Approve a draft plan. Refreshes the plan list on success. */
  approvePlan: (id: string) => Promise<Plan>;
  /**
   * Mark an active plan as completed. Thin wrapper over updatePlan with
   * `status: 'completed'`; exposed separately so UI callers can render a
   * dedicated confirm dialog without leaking the daemon's status encoding.
   */
  completePlan: (id: string) => Promise<Plan>;
  /** Delete a plan via the daemon. Refreshes the plan list on success. */
  deletePlan: (id: string) => Promise<void>;
  /** Create a unit via the daemon. Refreshes the unit list on success. */
  createUnit: (input: CreateUnitInput) => Promise<Unit>;
  /** Update a unit via the daemon. Refreshes the unit list on success. */
  updateUnit: (id: string, patch: UpdateUnitPatch) => Promise<Unit>;
  /** Delete a unit via the daemon. Refreshes the unit list on success. */
  deleteUnit: (id: string) => Promise<void>;
  /** Create a cycle via the daemon. Refreshes the cycle list on success. */
  createCycle: (input: CreateCycleInput) => Promise<Cycle>;
  /** Update a cycle via the daemon. Refreshes the cycle list on success. */
  updateCycle: (id: string, patch: UpdateCyclePatch) => Promise<Cycle>;
  /**
   * Activate a planning cycle (POST /cycles/:id/activate). Refreshes the cycle
   * list on success. Exposed separately from updateCycle because the daemon
   * rejects the equivalent PATCH (status='active' from 'planning') in favour
   * of this dedicated endpoint that records `started_at` server-side.
   */
  activateCycle: (id: string) => Promise<Cycle>;
  /** Complete an active cycle (POST /cycles/:id/complete). Irreversible. */
  completeCycle: (id: string) => Promise<Cycle>;
  /** Delete a cycle via the daemon. Refreshes the cycle list on success. */
  deleteCycle: (id: string) => Promise<void>;
  /** Create a task via the daemon. Refreshes the task list on success. */
  createTask: (input: CreateTaskInput) => Promise<Task>;
  /**
   * PATCH /tasks/:id. The daemon's `EVIDENCE_REQUIRED` guard rejects
   * `status: "done"` without a non-empty `evidence`; callers must pass both
   * in the same patch.
   */
  updateTask: (id: string, patch: UpdateTaskPatch) => Promise<Task>;
  /**
   * DELETE /tasks/:id. The daemon hard-deletes only when the task is `todo`
   * AND its plan is `draft`; otherwise the row transitions to `cancelled`
   * with a system comment. Callers see uniform `Promise<void>`; an optional
   * `reason` is forwarded as the cancellation note.
   */
  deleteTask: (id: string, opts?: { reason?: string }) => Promise<void>;
  /**
   * POST /tasks/:parent/subtasks. Creates a child task; inherits the parent's
   * unit/cycle unless overridden. Refreshes the task list on success.
   */
  createSubtask: (parentId: string, input: CreateSubtaskInput) => Promise<Task>;
  /**
   * POST /tasks/:id/decompose. Read-only suggestion endpoint — does not
   * mutate state, so no refetch. Used by SuggestionPanel (LM-87) to ask the
   * daemon for `success_criteria`-derived subtask suggestions.
   */
  decomposeTask: (id: string, args?: DecomposeTaskArgs) => Promise<DecompositionResult>;
  /**
   * Task-scoped comments. Not cached in DataProvider state — the TaskDetail
   * panel fetches on demand. Mutations resolve to the wire shape so callers
   * can update local view state immediately while the panel refetches.
   */
  listTaskComments: (taskId: string) => Promise<TaskComment[]>;
  createTaskComment: (
    taskId: string,
    input: CreateCommentInput,
  ) => Promise<TaskComment>;
  deleteTaskComment: (id: string) => Promise<void>;
  /**
   * Task-scoped runs. Read-only from the desktop — the Claude Code adapter
   * owns lifecycle. Not cached; panels fetch on demand.
   */
  listTaskRuns: (taskId: string) => Promise<Run[]>;
  /**
   * Cycle-scoped tasks (GET /cycles/:id/tasks). Used by TimelineView's cycle
   * progress meter to count done / in_progress / blocked against the active
   * cycle. Not cached — the view fetches on demand keyed off the active cycle
   * id so we don't pay the round-trip when the user is on another view.
   */
  listCycleTasks: (cycleId: string) => Promise<Task[]>;
  /**
   * Task-scoped questions. Create + answer round-trip through the daemon.
   */
  listTaskQuestions: (taskId: string) => Promise<Question[]>;
  createTaskQuestion: (input: CreateQuestionInput) => Promise<Question>;
  answerTaskQuestion: (
    id: string,
    input: AnswerQuestionInput,
  ) => Promise<Question>;
}

const DataContext = createContext<DataContextValue | null>(null);

export interface DataProviderProps {
  children: ReactNode;
  /** Initial project to load if localStorage has no selection. */
  projectId?: string;
  /** Override the singleton client (tests). */
  client?: DaemonClient;
  /** Disable SSE subscription (tests / web fallback). */
  disableSse?: boolean;
  /** Test injection point. */
  eventSourceImpl?: typeof EventSource;
  /** Override the localStorage backing (tests). */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

function readStoredActiveProject(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): string | null {
  if (!storage) return null;
  try {
    const v = storage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeStoredActiveProject(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  id: string | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id ?? "");
  } catch {
    // localStorage may be disabled (privacy mode); swallow.
  }
}

/**
 * Pick the active project from a list given:
 *   1. The persisted selection (if it still exists and is enabled).
 *   2. The fallback default (if it still exists).
 *   3. The first enabled project in the list.
 *   4. The first project regardless of enabled.
 *   5. null when the list is empty.
 */
function pickActiveProjectId(
  projects: Project[],
  preferred: string | null,
  fallbackDefault: string | undefined,
): string | null {
  if (projects.length === 0) return null;
  const enabled = (p: Project) => p.enabled !== 0;
  if (preferred && projects.some((p) => p.id === preferred)) return preferred;
  if (fallbackDefault && projects.some((p) => p.id === fallbackDefault)) {
    return fallbackDefault;
  }
  return (projects.find(enabled) ?? projects[0]).id;
}

/**
 * Pick a cwd for the project's wiki surface. Projects can register multiple
 * cwds (e.g., a wrapper + sub-repos). We pick the first one — the user can
 * register a fresh cwd via the CLI to influence selection. Returns null when
 * the project has no registered cwd so callers can skip the wiki fetch.
 */
function pickProjectCwd(
  projects: Project[],
  projectId: string | null,
): string | null {
  if (!projectId) return null;
  const p = projects.find((x) => x.id === projectId);
  if (!p || p.cwds.length === 0) return null;
  return p.cwds[0]!;
}

/**
 * Parallel initial fetch. Errors propagate to the caller; one failure aborts
 * the whole batch so the UI surfaces a single coherent error rather than
 * partially-populated state. Wiki-file fetch is soft-failed (empty result on
 * error) because the project may not have registered cwd, and the rest of
 * the dashboard should still load when filesystem access is restricted.
 */
async function fetchProjectScopedData(
  client: DaemonClient,
  projectId: string | undefined,
  cwd: string | null,
): Promise<{
  plans: Plan[];
  units: Unit[];
  cycles: Cycle[];
  tasks: Task[];
  knowledge: Knowledge[];
  timeline: TimelineEvent[];
  wikiFiles: WikiFile[];
  runs: Run[];
}> {
  const [plans, units, cycles, tasks, knowledge, timeline, wikiFiles, runs] =
    await Promise.all([
      client.listPlans(projectId),
      client.listUnits(),
      client.listCycles({ projectId }),
      client.listTasks(),
      client.listKnowledge({ projectId }),
      projectId
        ? client.listTimeline(projectId, { limit: 200 })
        : Promise.resolve<TimelineEvent[]>([]),
      cwd
        ? client
            .listWikiFiles({ cwd, projectId })
            .catch(() => [] as WikiFile[])
        : Promise.resolve<WikiFile[]>([]),
      // Soft-fail runs: when the daemon is unavailable or the user has no run
      // history yet, return [] so the rest of the dashboard still loads.
      projectId
        ? client
            .listRuns({ projectId })
            .catch(() => [] as Run[])
        : Promise.resolve<Run[]>([]),
    ]);
  return {
    plans,
    units,
    cycles,
    tasks,
    knowledge,
    timeline,
    wikiFiles,
    runs,
  };
}

async function fetchAll(
  client: DaemonClient,
  preferredProjectId: string | null,
  fallbackDefault: string | undefined,
): Promise<{
  projects: Project[];
  activeProjectId: string | null;
  plans: Plan[];
  units: Unit[];
  cycles: Cycle[];
  tasks: Task[];
  knowledge: Knowledge[];
  timeline: TimelineEvent[];
  wikiFiles: WikiFile[];
  runs: Run[];
}> {
  const projects = await client.listProjects();
  const activeProjectId = pickActiveProjectId(
    projects,
    preferredProjectId,
    fallbackDefault,
  );
  const cwd = pickProjectCwd(projects, activeProjectId);
  const scoped = await fetchProjectScopedData(
    client,
    activeProjectId ?? undefined,
    cwd,
  );
  return { projects, activeProjectId, ...scoped };
}

function resolveStorage(
  override: Pick<Storage, "getItem" | "setItem"> | undefined,
): Pick<Storage, "getItem" | "setItem"> | null {
  if (override) return override;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Access can throw under strict policies.
  }
  return null;
}

export function DataProvider({
  children,
  projectId,
  client,
  disableSse,
  eventSourceImpl,
  storage: storageOverride,
}: DataProviderProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const clientRef = useRef(client ?? getDaemonClient());
  clientRef.current = client ?? clientRef.current;
  const storageRef = useRef(resolveStorage(storageOverride));
  storageRef.current = resolveStorage(storageOverride);

  const activeProjectId = state.activeProjectId;
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;
  // Mirror projects into a ref so SSE refetch callbacks (memoized on
  // activeProjectId only) can resolve the cwd without an extra re-memo on
  // every project list mutation.
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = state.projects;
  const plansRef = useRef<Plan[]>([]);
  plansRef.current = state.plans;
  const unitsRef = useRef<Unit[]>([]);
  unitsRef.current = state.units;
  const cyclesRef = useRef<Cycle[]>([]);
  cyclesRef.current = state.cycles;
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = state.tasks;

  const refresh = useMemo(
    () => async () => {
      dispatch({ type: "INIT_START" });
      try {
        const preferred =
          activeProjectIdRef.current ??
          readStoredActiveProject(storageRef.current);
        const data = await fetchAll(clientRef.current, preferred, projectId);
        writeStoredActiveProject(storageRef.current, data.activeProjectId);
        dispatch({ type: "INIT_LOADED", ...data });
      } catch (e) {
        dispatch({ type: "INIT_ERROR", message: (e as Error).message });
      }
    },
    [projectId],
  );

  // Initial mount: fetch projects + scoped data once.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // After the initial load, refetch when the user switches projects.
  // We use `undefined` as a sentinel for "haven't observed a ready state yet"
  // so the post-init transition (idle → ready) does not trigger a redundant fetch.
  const lastLoadedProjectIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (state.status !== "ready") return;
    if (lastLoadedProjectIdRef.current === undefined) {
      lastLoadedProjectIdRef.current = activeProjectId;
      return;
    }
    if (lastLoadedProjectIdRef.current === activeProjectId) return;
    lastLoadedProjectIdRef.current = activeProjectId;
    void refresh();
  }, [activeProjectId, state.status, refresh]);

  const setActiveProject = useMemo(
    () => (id: string) => {
      if (id === state.activeProjectId) return;
      writeStoredActiveProject(storageRef.current, id);
      dispatch({ type: "SET_ACTIVE_PROJECT", id });
    },
    [state.activeProjectId],
  );

  const createProject = useMemo(
    () => async (input: CreateProjectInput): Promise<Project> => {
      const created = await clientRef.current.createProject(input);
      // Refetch the full project list so sort/key collisions reflect daemon
      // truth rather than guessing optimistically. Soft-fail: the SSE event
      // will follow up if listProjects throws transiently.
      try {
        const projects = await clientRef.current.listProjects();
        dispatch({ type: "UPSERT_PROJECTS", items: projects });
      } catch {
        dispatch({
          type: "UPSERT_PROJECTS",
          items: [...projectsRef.current, created],
        });
      }
      return created;
    },
    [],
  );

  const updateProject = useMemo(
    () => async (
      id: string,
      patch: UpdateProjectPatch,
    ): Promise<Project> => {
      const updated = await clientRef.current.updateProject(id, patch);
      try {
        const projects = await clientRef.current.listProjects();
        dispatch({ type: "UPSERT_PROJECTS", items: projects });
      } catch {
        dispatch({
          type: "UPSERT_PROJECTS",
          items: projectsRef.current.map((p) => (p.id === id ? updated : p)),
        });
      }
      return updated;
    },
    [],
  );

  const deleteProject = useMemo(
    () => async (id: string): Promise<void> => {
      await clientRef.current.deleteProject(id);
      // SseEntityType does not currently include "project" so REMOVE cannot
      // dispatch here. Filter optimistically and re-pull the list.
      dispatch({
        type: "UPSERT_PROJECTS",
        items: projectsRef.current.filter((p) => p.id !== id),
      });
      if (state.activeProjectId === id) {
        writeStoredActiveProject(storageRef.current, null);
        dispatch({ type: "SET_ACTIVE_PROJECT", id: null });
      }
      try {
        const projects = await clientRef.current.listProjects();
        dispatch({ type: "UPSERT_PROJECTS", items: projects });
      } catch {
        // Optimistic filter above is the fallback.
      }
    },
    [state.activeProjectId],
  );

  // Plans are scoped by activeProjectId. The refetch must use the current
  // value (read via ref), so a memo dep on activeProjectId is unnecessary —
  // SSE plan:* events also fire and provide belt-and-braces consistency, but
  // we refetch explicitly so callers see the new state synchronously after
  // the mutation resolves rather than waiting for the next event loop turn.
  const refetchPlans = useMemo(
    () => async (): Promise<void> => {
      try {
        const pid = activeProjectIdRef.current ?? undefined;
        const plans = await clientRef.current.listPlans(pid);
        dispatch({ type: "UPSERT_PLANS", items: plans });
      } catch {
        // SSE retry path will recover.
      }
    },
    [],
  );

  const createPlan = useMemo(
    () => async (input: CreatePlanInput): Promise<Plan> => {
      const created = await clientRef.current.createPlan(input);
      await refetchPlans();
      return created;
    },
    [refetchPlans],
  );

  const updatePlan = useMemo(
    () => async (
      id: string,
      patch: UpdatePlanPatch,
    ): Promise<Plan> => {
      const updated = await clientRef.current.updatePlan(id, patch);
      await refetchPlans();
      return updated;
    },
    [refetchPlans],
  );

  const approvePlan = useMemo(
    () => async (id: string): Promise<Plan> => {
      const updated = await clientRef.current.approvePlan(id);
      await refetchPlans();
      return updated;
    },
    [refetchPlans],
  );

  const completePlan = useMemo(
    () => async (id: string): Promise<Plan> => {
      const updated = await clientRef.current.completePlan(id);
      await refetchPlans();
      return updated;
    },
    [refetchPlans],
  );

  const deletePlan = useMemo(
    () => async (id: string): Promise<void> => {
      await clientRef.current.deletePlan(id);
      // Optimistic filter first so the deleted plan doesn't flash back when
      // the SSE plan:deleted event arrives concurrently with the refetch.
      dispatch({
        type: "UPSERT_PLANS",
        items: plansRef.current.filter((p) => p.id !== id),
      });
      await refetchPlans();
    },
    [refetchPlans],
  );

  // Units and cycles are not project-scoped on the daemon (units belong to
  // plans, cycles take an optional project_id query). Refetch the full lists
  // so ordering / counts come from the daemon rather than guessing.
  const refetchUnits = useMemo(
    () => async (): Promise<void> => {
      try {
        const units = await clientRef.current.listUnits();
        dispatch({ type: "UPSERT_UNITS", items: units });
      } catch {
        // SSE retry path will recover.
      }
    },
    [],
  );

  const refetchCycles = useMemo(
    () => async (): Promise<void> => {
      try {
        const pid = activeProjectIdRef.current ?? undefined;
        const cycles = await clientRef.current.listCycles({ projectId: pid });
        dispatch({ type: "UPSERT_CYCLES", items: cycles });
      } catch {
        // SSE retry path will recover.
      }
    },
    [],
  );

  const createUnit = useMemo(
    () => async (input: CreateUnitInput): Promise<Unit> => {
      const created = await clientRef.current.createUnit(input);
      await refetchUnits();
      return created;
    },
    [refetchUnits],
  );

  const updateUnit = useMemo(
    () => async (id: string, patch: UpdateUnitPatch): Promise<Unit> => {
      const updated = await clientRef.current.updateUnit(id, patch);
      await refetchUnits();
      return updated;
    },
    [refetchUnits],
  );

  const deleteUnit = useMemo(
    () => async (id: string): Promise<void> => {
      await clientRef.current.deleteUnit(id);
      // Optimistic filter so the row doesn't flash back when SSE unit:deleted
      // arrives concurrently with the refetch.
      dispatch({
        type: "UPSERT_UNITS",
        items: unitsRef.current.filter((u) => u.id !== id),
      });
      await refetchUnits();
    },
    [refetchUnits],
  );

  const createCycle = useMemo(
    () => async (input: CreateCycleInput): Promise<Cycle> => {
      const created = await clientRef.current.createCycle(input);
      await refetchCycles();
      return created;
    },
    [refetchCycles],
  );

  const updateCycle = useMemo(
    () => async (id: string, patch: UpdateCyclePatch): Promise<Cycle> => {
      const updated = await clientRef.current.updateCycle(id, patch);
      await refetchCycles();
      return updated;
    },
    [refetchCycles],
  );

  const activateCycle = useMemo(
    () => async (id: string): Promise<Cycle> => {
      const updated = await clientRef.current.activateCycle(id);
      await refetchCycles();
      return updated;
    },
    [refetchCycles],
  );

  const completeCycle = useMemo(
    () => async (id: string): Promise<Cycle> => {
      const updated = await clientRef.current.completeCycle(id);
      await refetchCycles();
      return updated;
    },
    [refetchCycles],
  );

  const deleteCycle = useMemo(
    () => async (id: string): Promise<void> => {
      await clientRef.current.deleteCycle(id);
      dispatch({
        type: "UPSERT_CYCLES",
        items: cyclesRef.current.filter((c) => c.id !== id),
      });
      await refetchCycles();
    },
    [refetchCycles],
  );

  // Tasks are not project-scoped on the daemon (`listTasks()` returns the
  // full set; the renderer filters per-view by activeProjectId via plan/unit
  // joins). Refetch the full list so ordering reflects daemon truth.
  const refetchTasks = useMemo(
    () => async (): Promise<void> => {
      try {
        const tasks = await clientRef.current.listTasks();
        dispatch({ type: "UPSERT_TASKS", items: tasks });
      } catch {
        // SSE retry path will recover.
      }
    },
    [],
  );

  const createTask = useMemo(
    () => async (input: CreateTaskInput): Promise<Task> => {
      const created = await clientRef.current.createTask(input);
      await refetchTasks();
      return created;
    },
    [refetchTasks],
  );

  const updateTask = useMemo(
    () => async (id: string, patch: UpdateTaskPatch): Promise<Task> => {
      const updated = await clientRef.current.updateTask(id, patch);
      await refetchTasks();
      return updated;
    },
    [refetchTasks],
  );

  const deleteTask = useMemo(
    () => async (
      id: string,
      opts?: { reason?: string },
    ): Promise<void> => {
      await clientRef.current.deleteTask(id, opts);
      // Optimistic filter — for hard-delete the row vanishes; for soft-cancel
      // the refetch below restores it with status='cancelled'. Either way the
      // row doesn't flash back when the SSE task:deleted event races us.
      dispatch({
        type: "UPSERT_TASKS",
        items: tasksRef.current.filter((t) => t.id !== id),
      });
      await refetchTasks();
    },
    [refetchTasks],
  );

  const createSubtask = useMemo(
    () => async (
      parentId: string,
      input: CreateSubtaskInput,
    ): Promise<Task> => {
      const created = await clientRef.current.createSubtask(parentId, input);
      await refetchTasks();
      return created;
    },
    [refetchTasks],
  );

  const decomposeTask = useMemo(
    () => (
      id: string,
      args?: DecomposeTaskArgs,
    ): Promise<DecompositionResult> =>
      clientRef.current.decomposeTask(id, args),
    [],
  );

  const health = useMemo(
    () => (): Promise<boolean> => clientRef.current.health(),
    [],
  );

  // Task-scoped sidebars (comments / runs / questions) are not cached in
  // reducer state — they're rendered on demand inside the TaskDetail panel.
  // Each method is a direct passthrough; the panel owns its own fetch cycle.
  // Memoization is kept stable so consumer effects don't fire on every render.
  const listTaskComments = useMemo(
    () => (taskId: string): Promise<TaskComment[]> =>
      clientRef.current.listComments(taskId),
    [],
  );
  const createTaskComment = useMemo(
    () => (
      taskId: string,
      input: CreateCommentInput,
    ): Promise<TaskComment> => clientRef.current.createComment(taskId, input),
    [],
  );
  const deleteTaskComment = useMemo(
    () => (id: string): Promise<void> => clientRef.current.deleteComment(id),
    [],
  );
  const listTaskRuns = useMemo(
    () => (taskId: string): Promise<Run[]> =>
      clientRef.current.listRuns({ taskId }),
    [],
  );
  const listCycleTasks = useMemo(
    () => (cycleId: string): Promise<Task[]> =>
      clientRef.current.listCycleTasks(cycleId),
    [],
  );
  const listTaskQuestions = useMemo(
    () => (taskId: string): Promise<Question[]> =>
      clientRef.current.listQuestions({ taskId }),
    [],
  );
  const createTaskQuestion = useMemo(
    () => (input: CreateQuestionInput): Promise<Question> =>
      clientRef.current.createQuestion(input),
    [],
  );
  const answerTaskQuestion = useMemo(
    () => (id: string, input: AnswerQuestionInput): Promise<Question> =>
      clientRef.current.answerQuestion(id, input),
    [],
  );

  const handleSseEvent = useMemo(() => {
    async function refetchAfter(entity: SseEntityType): Promise<void> {
      const c = clientRef.current;
      const pid = activeProjectId ?? undefined;
      try {
        switch (entity) {
          case "plan":
            dispatch({
              type: "UPSERT_PLANS",
              items: await c.listPlans(pid),
            });
            break;
          case "unit":
            dispatch({ type: "UPSERT_UNITS", items: await c.listUnits() });
            break;
          case "cycle":
            dispatch({
              type: "UPSERT_CYCLES",
              items: await c.listCycles({ projectId: pid }),
            });
            break;
          case "task": {
            dispatch({ type: "UPSERT_TASKS", items: await c.listTasks() });
            // Task lifecycle events (started/done/cancelled) drive run
            // creation/closure on the daemon side. Refresh runs alongside so
            // TimelineView's swimlane reflects the latest activity without
            // waiting for the next manual refresh. Soft-fail.
            if (pid) {
              try {
                dispatch({
                  type: "UPSERT_RUNS",
                  items: await c.listRuns({ projectId: pid }),
                });
              } catch {
                // SSE retry path will recover.
              }
            }
            break;
          }
          case "knowledge": {
            dispatch({
              type: "UPSERT_KNOWLEDGE",
              items: await c.listKnowledge({ projectId: pid }),
            });
            // Refresh filesystem wiki files too: knowledge import writes new
            // knowledge rows that mirror .md files, and export writes new
            // .md files to disk. Either direction means the file list may
            // have changed. Soft-fail (default to []) when cwd is missing.
            const cwd = pickProjectCwd(projectsRef.current, activeProjectId);
            if (cwd && pid) {
              try {
                dispatch({
                  type: "UPSERT_WIKI_FILES",
                  items: await c.listWikiFiles({ cwd, projectId: pid }),
                });
              } catch {
                // soft-fail, see fetchProjectScopedData.
              }
            }
            break;
          }
          default:
            // comment / unknown — fold into timeline refresh.
            if (pid) {
              dispatch({
                type: "UPSERT_TIMELINE",
                items: await c.listTimeline(pid, { limit: 200 }),
              });
            }
        }
        // Timeline always reflects all entity changes.
        if (pid && entity !== "comment") {
          dispatch({
            type: "UPSERT_TIMELINE",
            items: await c.listTimeline(pid, { limit: 200 }),
          });
        }
      } catch {
        // Soft-fail SSE refetch: the next event or manual refresh recovers.
      }
    }

    return (ev: DaemonEvent) => {
      const { entity, change } = parseEventName(ev.event);
      const id =
        ev.data && typeof ev.data === "object" && "id" in ev.data
          ? String((ev.data as { id: unknown }).id)
          : "";
      if (change === "deleted" && id) {
        dispatch({ type: "REMOVE", entity, id });
        return;
      }
      void refetchAfter(entity);
    };
  }, [activeProjectId]);

  const sseState = useEvents({
    onEvent: handleSseEvent,
    disabled: disableSse,
    eventSourceImpl,
  });

  // Mirror useEvents → reducer so consumers see a unified state.
  useEffect(() => {
    dispatch({ type: "SSE_STATE", sse: sseState });
  }, [sseState.readyState, sseState.lastEventId, sseState.error, sseState]);

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      refresh,
      health,
      setActiveProject,
      createProject,
      updateProject,
      deleteProject,
      createPlan,
      updatePlan,
      approvePlan,
      completePlan,
      deletePlan,
      createUnit,
      updateUnit,
      deleteUnit,
      createCycle,
      updateCycle,
      activateCycle,
      completeCycle,
      deleteCycle,
      createTask,
      updateTask,
      deleteTask,
      createSubtask,
      decomposeTask,
      listTaskComments,
      createTaskComment,
      deleteTaskComment,
      listTaskRuns,
      listCycleTasks,
      listTaskQuestions,
      createTaskQuestion,
      answerTaskQuestion,
    }),
    [
      state,
      refresh,
      health,
      setActiveProject,
      createProject,
      updateProject,
      deleteProject,
      createPlan,
      updatePlan,
      approvePlan,
      completePlan,
      deletePlan,
      createUnit,
      updateUnit,
      deleteUnit,
      createCycle,
      updateCycle,
      activateCycle,
      completeCycle,
      deleteCycle,
      createTask,
      updateTask,
      deleteTask,
      createSubtask,
      decomposeTask,
      listTaskComments,
      createTaskComment,
      deleteTaskComment,
      listTaskRuns,
      listCycleTasks,
      listTaskQuestions,
      createTaskQuestion,
      answerTaskQuestion,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used inside <DataProvider>");
  }
  return ctx;
}

// Test seam.
export const __test = {
  reducer,
  INITIAL,
  fetchAll,
  pickActiveProjectId,
  pickProjectCwd,
  ACTIVE_PROJECT_STORAGE_KEY,
};
