import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge, Button, cn } from "@clawket/ui";
import { ViewShell } from "./ViewShell";
import { useSelection } from "../shell/selection";
import { useData } from "../data/DataProvider";
import { CycleCreateModal } from "../shell/CycleCreateModal";
import { CycleEditModal } from "../shell/CycleEditModal";
import type {
  Cycle,
  CycleStatus,
  Plan,
  Task,
  TaskStatus,
  Unit,
} from "../data/types";
import type {
  CreateCycleInput,
  UpdateCyclePatch,
} from "../data/api";
import { COLUMNS } from "./board/constants";
import { DraggableTaskCard, TaskCard } from "./board/TaskCard";
import { DroppableColumn } from "./board/DroppableColumn";
import { ArchivedSection } from "./board/ArchivedSection";

/**
 * BoardView — Kanban surface for the active cycle.
 *
 * Visual + structural parity with `clawket/web/src/components/BoardView.tsx`:
 *   - 4 live columns (todo / in_progress / blocked / done) with the same
 *     header colour palette.
 *   - DraggableTaskCard rendered identically (ticket / tier / title /
 *     assignee / priority dot / inline transition buttons).
 *   - DragOverlay holds a stateless TaskCard preview while a drag is in
 *     flight (see `web/.claude/rules/dnd-kit-overlay-state.md`).
 *   - ArchivedSection holds cancelled tasks beneath the grid.
 *   - Cycle toolbar (select + New Cycle + Edit + status badge + status
 *     switcher) and cycle header.
 *
 * The data adapter differs from web on purpose: the desktop consumes
 * `useData()` (DataProvider) instead of issuing `api.listCycles` directly,
 * so SSE patches and other views stay in sync. Mutations route through the
 * same provider (`updateTask`, `createCycle`, `updateCycle`,
 * `activateCycle`, `completeCycle`).
 */

const CYCLE_STATUS_ORDER: CycleStatus[] = ["planning", "active"];

const CYCLE_STATUS_BADGE_VARIANT: Record<
  CycleStatus,
  "neutral" | "info" | "success"
> = {
  planning: "neutral",
  active: "info",
  completed: "success",
};

const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
};

function findActivePlan(plans: Plan[]): Plan | null {
  return plans.find((p) => p.status === "active") ?? plans[0] ?? null;
}

function cyclesOfPlan(cycles: Cycle[], units: Unit[], plan: Plan | null): Cycle[] {
  if (!plan) return [];
  const planUnitIds = new Set(
    units.filter((u) => u.plan_id === plan.id).map((u) => u.id),
  );
  return cycles
    .filter((c) => c.unit_id !== null && planUnitIds.has(c.unit_id))
    .slice()
    .sort((a, b) => {
      // Active first, then most recent started_at first.
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      const ta = a.started_at ?? a.created_at;
      const tb = b.started_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
}

function pickDefaultCycle(scoped: Cycle[]): Cycle | null {
  return scoped.find((c) => c.status === "active") ?? scoped[0] ?? null;
}

function pickFallbackUnitId(units: Unit[], plan: Plan | null): string | null {
  if (!plan) return null;
  const u = units.find((x) => x.plan_id === plan.id);
  return u?.id ?? null;
}

export function BoardView() {
  const { select } = useSelection();
  const {
    status,
    error,
    plans,
    units,
    cycles,
    tasks,
    activeProjectId,
    updateTask,
    createCycle,
    updateCycle,
    activateCycle,
    completeCycle,
  } = useData();

  const [overrideCycleId, setOverrideCycleId] = useState<string | null>(null);
  const [showNewCycleModal, setShowNewCycleModal] = useState(false);
  const [editingCycle, setEditingCycle] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  // 5px activation threshold separates click from drag — see
  // `dnd-kit-overlay-state.md`. Do not reduce without conscious review.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activePlan = useMemo(() => findActivePlan(plans), [plans]);
  const scopedCycles = useMemo(
    () => cyclesOfPlan(cycles, units, activePlan),
    [cycles, units, activePlan],
  );
  const defaultCycle = useMemo(
    () => pickDefaultCycle(scopedCycles),
    [scopedCycles],
  );
  const selectedCycle = useMemo<Cycle | null>(() => {
    if (overrideCycleId) {
      return scopedCycles.find((c) => c.id === overrideCycleId) ?? defaultCycle;
    }
    return defaultCycle;
  }, [overrideCycleId, scopedCycles, defaultCycle]);

  const visibleTasks = useMemo(() => {
    if (!selectedCycle) return [];
    return tasks.filter((t) => t.cycle_id === selectedCycle.id);
  }, [tasks, selectedCycle]);

  const tasksByStatus = useMemo<Record<TaskStatus, Task[]>>(() => {
    const out: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    };
    for (const t of visibleTasks) {
      if (out[t.status]) out[t.status].push(t);
    }
    return out;
  }, [visibleTasks]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveTask(
        visibleTasks.find((t) => t.id === event.active.id) ?? null,
      );
    },
    [visibleTasks],
  );

  const handleDragCancel = useCallback(() => {
    // Symmetric cleanup — `dnd-kit-overlay-state.md` mandates both end + cancel.
    setActiveTask(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;
      const taskId = String(active.id);
      const newStatus = String(over.id) as TaskStatus;
      const task = visibleTasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      try {
        setBoardError(null);
        await updateTask(taskId, { status: newStatus });
      } catch (err) {
        setBoardError(
          err instanceof Error ? err.message : "Failed to update task status",
        );
      }
    },
    [visibleTasks, updateTask],
  );

  const handleStatusButton = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      try {
        setBoardError(null);
        await updateTask(taskId, { status: newStatus });
      } catch (err) {
        setBoardError(
          err instanceof Error ? err.message : "Failed to update task status",
        );
      }
    },
    [updateTask],
  );

  const handleCycleStatusChange = useCallback(
    async (newStatus: CycleStatus) => {
      if (!selectedCycle || statusUpdating) return;
      if (newStatus === selectedCycle.status) return;
      setStatusUpdating(true);
      setBoardError(null);
      try {
        if (newStatus === "active") {
          // Daemon rejects PATCH status='active' on a planning cycle —
          // POST /cycles/:id/activate records started_at server-side.
          await activateCycle(selectedCycle.id);
        } else if (newStatus === "completed") {
          await completeCycle(selectedCycle.id);
        } else {
          await updateCycle(selectedCycle.id, { status: newStatus });
        }
      } catch (err) {
        setBoardError(
          err instanceof Error ? err.message : "Failed to update cycle status",
        );
      } finally {
        setStatusUpdating(false);
      }
    },
    [
      selectedCycle,
      statusUpdating,
      activateCycle,
      completeCycle,
      updateCycle,
    ],
  );

  const handleCycleCreate = useCallback(
    async (input: CreateCycleInput) => {
      const created = await createCycle(input);
      setOverrideCycleId(created.id);
      setShowNewCycleModal(false);
    },
    [createCycle],
  );

  const handleCycleEdit = useCallback(
    async (id: string, patch: UpdateCyclePatch) => {
      await updateCycle(id, patch);
      setEditingCycle(false);
    },
    [updateCycle],
  );

  if (status === "loading" || status === "idle") {
    return (
      <ViewShell title="Board" subtitle="Loading…" testId="view-board">
        <div className="p-6 text-body-sm text-muted">Loading data…</div>
      </ViewShell>
    );
  }
  if (status === "error") {
    return (
      <ViewShell title="Board" subtitle="Failed to load" testId="view-board">
        <div data-testid="board-error" className="p-6 text-body-sm text-danger">
          {error ?? "Unknown error"}
        </div>
      </ViewShell>
    );
  }

  const subtitle = selectedCycle
    ? `${selectedCycle.title} · ${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"}`
    : activePlan
      ? `${activePlan.title} · no active cycle`
      : "No active plan";

  const fallbackUnitId = pickFallbackUnitId(units, activePlan);
  const createUnitId = selectedCycle?.unit_id ?? fallbackUnitId;
  const canCreateCycle =
    activeProjectId !== null && createUnitId !== null;

  // Empty-state hint — when the active plan has no cycles attached, mirror the
  // web component's call-to-action rather than rendering empty columns.
  if (scopedCycles.length === 0) {
    return (
      <ViewShell title="Board" subtitle={subtitle} testId="view-board">
        <div
          data-testid="board-no-cycles"
          className="flex h-full flex-col items-center justify-center gap-4 p-6"
        >
          <div className="text-sm text-muted">
            {activePlan
              ? "No cycles yet. Create one to start a sprint."
              : "No active plan."}
          </div>
          {canCreateCycle && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowNewCycleModal(true)}
            >
              New Cycle
            </Button>
          )}
        </div>
        {showNewCycleModal && activeProjectId && createUnitId && (
          <CycleCreateModal
            projectId={activeProjectId}
            unitId={createUnitId}
            onClose={() => setShowNewCycleModal(false)}
            onSubmit={handleCycleCreate}
          />
        )}
      </ViewShell>
    );
  }

  return (
    <ViewShell title="Board" subtitle={subtitle} testId="view-board">
      <div className="flex h-full min-h-0 flex-col gap-4 p-4">
        {/* Cycle toolbar — mirrors web BoardView toolbar. */}
        <div
          data-testid="board-scope-bar"
          aria-label="Cycle scope"
          className="flex shrink-0 flex-wrap items-center gap-3"
        >
          <select
            data-testid="board-cycle-select"
            value={selectedCycle?.id ?? ""}
            onChange={(e) => setOverrideCycleId(e.target.value || null)}
            className={cn(
              "h-7 w-auto min-w-[200px] max-w-[320px] rounded-md border border-border bg-background px-2",
              "text-body-sm text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            {scopedCycles
              .filter((c) => c.status !== "completed")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} [{CYCLE_STATUS_LABEL[c.status]}]
                </option>
              ))}
            {scopedCycles.some((c) => c.status === "completed") && (
              <option disabled>── Completed ──</option>
            )}
            {scopedCycles
              .filter((c) => c.status === "completed")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </select>
          {canCreateCycle && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewCycleModal(true)}
            >
              + New Cycle
            </Button>
          )}
          <div className="flex-1" />
          {selectedCycle && (
            <div className="flex items-center gap-2">
              {selectedCycle.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="cycle-edit-open"
                  onClick={() => setEditingCycle(true)}
                >
                  Edit
                </Button>
              )}
              <Badge
                variant={CYCLE_STATUS_BADGE_VARIANT[selectedCycle.status]}
                size="sm"
                data-testid="board-selected-cycle-status"
              >
                {CYCLE_STATUS_LABEL[selectedCycle.status]}
              </Badge>
              <select
                data-testid="board-cycle-status"
                value={selectedCycle.status}
                onChange={(e) =>
                  handleCycleStatusChange(e.target.value as CycleStatus)
                }
                disabled={statusUpdating || selectedCycle.status === "completed"}
                className={cn(
                  "h-7 w-auto min-w-[120px] rounded-md border border-border bg-background px-2",
                  "text-body-sm text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {CYCLE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {CYCLE_STATUS_LABEL[s]}
                  </option>
                ))}
                {selectedCycle.status === "completed" && (
                  <option value="completed">
                    {CYCLE_STATUS_LABEL.completed}
                  </option>
                )}
              </select>
            </div>
          )}
        </div>

        {/* Cycle header — title + goal. */}
        {selectedCycle && (
          <div className="shrink-0">
            <h2 className="text-lg font-semibold text-foreground">
              {selectedCycle.title}
            </h2>
            {selectedCycle.goal && (
              <p className="mt-1 text-sm text-muted">{selectedCycle.goal}</p>
            )}
          </div>
        )}

        {boardError && (
          <div
            role="alert"
            data-testid="board-action-error"
            className="shrink-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {boardError}
          </div>
        )}

        {/* Kanban columns. */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = tasksByStatus[col.key];
              return (
                <DroppableColumn key={col.key} col={col} count={colTasks.length}>
                  {colTasks.length === 0 && (
                    <div
                      data-testid="board-column-empty"
                      className="py-6 text-center text-xs text-muted/50"
                    >
                      No tasks
                    </div>
                  )}
                  {colTasks.map((task) => (
                    <DraggableTaskCard
                      key={task.id}
                      task={task}
                      onClick={() => select(task.id, "task")}
                      onStatusChange={(newStatus) =>
                        handleStatusButton(task.id, newStatus)
                      }
                    />
                  ))}
                </DroppableColumn>
              );
            })}
          </div>
          {/* Overlay children stay stateless — see dnd-kit-overlay-state.md. */}
          <DragOverlay>
            {activeTask ? (
              <div className="pointer-events-none opacity-75">
                <TaskCard
                  task={activeTask}
                  onClick={() => {}}
                  onStatusChange={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <ArchivedSection
          tasksByStatus={tasksByStatus}
          onSelectTask={(id) => select(id, "task")}
        />
      </div>

      {showNewCycleModal && activeProjectId && createUnitId && (
        <CycleCreateModal
          projectId={activeProjectId}
          unitId={createUnitId}
          onClose={() => setShowNewCycleModal(false)}
          onSubmit={handleCycleCreate}
        />
      )}
      {editingCycle && selectedCycle && (
        <CycleEditModal
          cycle={selectedCycle}
          onClose={() => setEditingCycle(false)}
          onSubmit={handleCycleEdit}
        />
      )}
    </ViewShell>
  );
}
