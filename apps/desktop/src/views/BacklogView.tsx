import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge, Button, cn } from "@clawket/ui";
import { ViewShell } from "./ViewShell";
import { useSelection } from "../shell/selection";
import { useData } from "../data/DataProvider";
import type { Cycle, Task } from "../data/types";

const BACKLOG_DROP_ID = "backlog";

const CLOSED_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "done",
  "cancelled",
]);

// Priority dot palette. Mirrors clawket/web's BacklogView priorityDotColor map.
// The daemon currently emits `priority: 'critical' | 'high' | 'medium' | 'low'`
// (see clawket/web/src/types.ts). Falls back to `bg-muted` for unknown values.
const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-primary",
  low: "bg-muted",
};

function priorityDotClass(priority: string): string {
  return PRIORITY_DOT[priority] ?? "bg-muted";
}

// Cycle status mapping for the section header pill. Web renders these via the
// shared StatusBadge component that maps both task and cycle statuses to Badge
// variants; the desktop StatusPill is typed to TaskStatus only, so we mirror
// the cycle-side mapping here. Keep the visual mapping aligned with
// clawket/web/src/components/StatusBadge.tsx.
const CYCLE_STATUS_VARIANT: Record<
  Cycle["status"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  planning: "neutral",
  active: "info",
  completed: "success",
};

const CYCLE_STATUS_LABEL: Record<Cycle["status"], string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
};

const TASK_STATUS_VARIANT: Record<
  Task["status"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  todo: "neutral",
  in_progress: "warning",
  done: "success",
  blocked: "danger",
  cancelled: "neutral",
};

const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

function TaskStatusBadge({ status }: { status: Task["status"] }) {
  return (
    <Badge variant={TASK_STATUS_VARIANT[status]} size="sm">
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

function CycleStatusBadge({ status }: { status: Cycle["status"] }) {
  return (
    <Badge variant={CYCLE_STATUS_VARIANT[status]} size="sm">
      {CYCLE_STATUS_LABEL[status]}
    </Badge>
  );
}

// Tier chip — mirrors clawket/web/src/components/board/TaskCard.tsx::TierBadge
// (token-only palette; advisory in v3, hard-enforced in v4). Surfaces an
// "declared → executed" arrow when tier_used diverges from the declared tier.
const TIER_CLASS: Record<NonNullable<Task["tier"]>, string> = {
  low: "bg-surface-high text-muted",
  med: "bg-primary/15 text-primary",
  high: "bg-warning/15 text-warning",
};

function TierChip({ task }: { task: Task }) {
  const declared = task.tier ?? null;
  const used = task.tier_used ?? null;
  if (!declared && !used) return null;
  const tier = (declared ?? used)!;
  const cls = TIER_CLASS[tier] ?? "bg-surface-high text-muted";
  const escalated = declared && used && declared !== used;
  return (
    <span
      className={cn(
        "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
        cls,
      )}
      title={escalated ? `tier ${declared} → executed ${used}` : `tier ${tier}`}
    >
      {escalated ? `${declared}→${used}` : tier}
    </span>
  );
}

// --- DnD wrappers -----------------------------------------------------------

interface DroppableSectionProps {
  id: string;
  children: (isOver: boolean) => React.ReactNode;
}

function DroppableSection({ id, children }: DroppableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef}>{children(isOver)}</div>;
}

interface DraggableTaskRowProps {
  task: Task;
  showBorder: boolean;
  onSelect: () => void;
  selected: boolean;
  trailing?: React.ReactNode;
}

function DraggableTaskRow({
  task,
  showBorder,
  onSelect,
  selected,
  trailing,
}: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="backlog-task-row"
      data-task-id={task.id}
      data-selected={selected || undefined}
      className={cn(
        "flex items-center gap-3 px-4 py-2 transition-colors",
        "hover:bg-surface-high",
        showBorder && "border-t border-border",
        isDragging && "opacity-40",
        selected && "bg-surface-high",
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            priorityDotClass(task.priority),
          )}
        />
        {task.ticket_number && (
          <span className="font-mono text-xs text-muted shrink-0 w-16">
            {task.ticket_number}
          </span>
        )}
        <span className="text-sm text-foreground truncate flex-1">
          {task.title}
        </span>
        <TierChip task={task} />
        <TaskStatusBadge status={task.status} />
        {task.assignee && (
          <span className="text-xs text-muted shrink-0">{task.assignee}</span>
        )}
      </button>
      {trailing}
    </div>
  );
}

// --- Main view --------------------------------------------------------------

export function BacklogView() {
  const { selectedId, select } = useSelection();
  const {
    status,
    error,
    activeProjectId,
    cycles,
    tasks,
    plans,
    units,
    updateTask,
    activateCycle,
    completeCycle,
  } = useData();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Cross-section drag state. Per the dnd-kit-overlay-state rule, this lives
  // at the DndContext parent and is set only in onDragStart/onDragEnd/cancel.
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [collapsedCycles, setCollapsedCycles] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedBacklog, setCollapsedBacklog] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);

  // Scope tasks + cycles to the active project. The daemon's listTasks()
  // returns every task; we filter via plan→unit→cycle joins so the desktop
  // view shows only what belongs to the active project — same invariant as
  // clawket/web (which scopes its listBacklog/listCycles calls by projectId).
  const scoped = useMemo(() => {
    const projectPlanIds = new Set(
      plans.filter((p) => p.project_id === activeProjectId).map((p) => p.id),
    );
    const projectUnitIds = new Set(
      units.filter((u) => projectPlanIds.has(u.plan_id)).map((u) => u.id),
    );
    const projectCycles = cycles.filter(
      (c) => c.project_id === activeProjectId,
    );
    const projectCycleIds = new Set(projectCycles.map((c) => c.id));
    const projectTasks = tasks.filter(
      (t) =>
        projectUnitIds.has(t.unit_id) ||
        (t.cycle_id !== null && projectCycleIds.has(t.cycle_id)),
    );
    return { projectCycles, projectTasks };
  }, [activeProjectId, plans, units, cycles, tasks]);

  const activeCycles = useMemo(
    () => scoped.projectCycles.filter((c) => c.status !== "completed"),
    [scoped.projectCycles],
  );

  const tasksByCycle = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scoped.projectTasks) {
      if (t.cycle_id === null) continue;
      const arr = map.get(t.cycle_id) ?? [];
      arr.push(t);
      map.set(t.cycle_id, arr);
    }
    return map;
  }, [scoped.projectTasks]);

  const backlogTasks = useMemo(
    () => scoped.projectTasks.filter((t) => t.cycle_id === null),
    [scoped.projectTasks],
  );

  function findTask(taskId: string): Task | null {
    return scoped.projectTasks.find((t) => t.id === taskId) ?? null;
  }

  function toggleCycle(cycleId: string) {
    setCollapsedCycles((prev) => {
      const next = new Set(prev);
      if (next.has(cycleId)) next.delete(cycleId);
      else next.add(cycleId);
      return next;
    });
  }

  async function handleAssignCycle(taskId: string, cycleId: string) {
    setAssigningTaskId(null);
    try {
      await updateTask(taskId, { cycleId });
    } catch (err) {
      console.error("Failed to assign task to cycle:", err);
    }
  }

  async function handleUnassign(taskId: string) {
    try {
      await updateTask(taskId, { cycleId: null });
    } catch (err) {
      console.error("Failed to unassign task:", err);
    }
  }

  async function handleStartCycle(cycleId: string) {
    try {
      await activateCycle(cycleId);
    } catch (err) {
      console.error("Failed to start cycle:", err);
    }
  }

  async function handleEndCycle(cycleId: string) {
    try {
      await completeCycle(cycleId);
    } catch (err) {
      console.error("Failed to end cycle:", err);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = findTask(event.active.id as string);
    setActiveTask(task);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetId = over.id as string;
    const task = findTask(taskId);
    if (!task) return;

    const currentCycleId = task.cycle_id;

    if (targetId === BACKLOG_DROP_ID) {
      if (currentCycleId === null) return;
      try {
        await updateTask(taskId, { cycleId: null });
      } catch (err) {
        console.error("Failed to move task to backlog:", err);
      }
      return;
    }

    if (currentCycleId === targetId) return;
    try {
      await updateTask(taskId, { cycleId: targetId });
    } catch (err) {
      console.error("Failed to move task to cycle:", err);
    }
  }

  function handleDragCancel() {
    setActiveTask(null);
  }

  if (status === "loading" || status === "idle") {
    return (
      <ViewShell title="Backlog" subtitle="Loading…" testId="view-backlog">
        <div className="p-6 text-body-sm text-muted">Loading data…</div>
      </ViewShell>
    );
  }
  if (status === "error") {
    return (
      <ViewShell
        title="Backlog"
        subtitle="Failed to load"
        testId="view-backlog"
      >
        <div
          data-testid="backlog-error"
          className="p-6 text-body-sm text-danger"
        >
          {error ?? "Unknown error"}
        </div>
      </ViewShell>
    );
  }

  return (
    <ViewShell title="Backlog" testId="view-backlog">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          data-testid="backlog-list"
          className="flex flex-col gap-2 p-4 overflow-y-auto h-full"
        >
          {/* Cycle sections (active + planning) */}
          {activeCycles.map((cycle) => {
            const cycleTasks = tasksByCycle.get(cycle.id) ?? [];
            const collapsed = collapsedCycles.has(cycle.id);
            const doneCount = cycleTasks.filter((t) =>
              CLOSED_STATUSES.has(t.status),
            ).length;

            return (
              <DroppableSection key={cycle.id} id={cycle.id}>
                {(isOver) => (
                  <div
                    data-testid="backlog-section"
                    data-section-id={cycle.id}
                    data-section-kind="cycle"
                    data-cycle-status={cycle.status}
                    data-is-over={isOver || undefined}
                    className={cn(
                      "rounded-lg border bg-surface overflow-hidden transition-colors",
                      isOver ? "border-primary" : "border-border",
                    )}
                  >
                    <div className="flex items-center gap-3 px-4 py-3 bg-surface-high">
                      <button
                        type="button"
                        onClick={() => toggleCycle(cycle.id)}
                        aria-expanded={!collapsed}
                        data-testid={`backlog-section-toggle-${cycle.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <span aria-hidden className="text-muted text-xs shrink-0">
                          {collapsed ? "▶" : "▼"}
                        </span>
                        <span className="text-sm font-semibold text-foreground truncate">
                          {cycle.title}
                        </span>
                        <span
                          data-testid={`backlog-section-count-${cycle.id}`}
                          className="text-xs text-muted shrink-0 tabular-nums"
                        >
                          {doneCount}/{cycleTasks.length}
                        </span>
                        <CycleStatusBadge status={cycle.status} />
                      </button>
                      {cycle.status === "planning" && (
                        <Button
                          variant="primary"
                          size="sm"
                          data-testid={`backlog-cycle-start-${cycle.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleStartCycle(cycle.id);
                          }}
                        >
                          Start Cycle
                        </Button>
                      )}
                      {cycle.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`backlog-cycle-end-${cycle.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleEndCycle(cycle.id);
                          }}
                        >
                          End Cycle
                        </Button>
                      )}
                    </div>

                    {!collapsed && (
                      <div
                        data-testid={`backlog-section-list-${cycle.id}`}
                        className="max-h-80 overflow-y-auto"
                      >
                        {cycleTasks.length === 0 ? (
                          <div
                            data-testid={`backlog-section-empty-${cycle.id}`}
                            className="px-4 py-3 text-sm text-muted italic"
                          >
                            No tasks in this cycle. Drag from backlog below.
                          </div>
                        ) : (
                          cycleTasks.map((task, i) => (
                            <DraggableTaskRow
                              key={task.id}
                              task={task}
                              showBorder={i > 0}
                              selected={selectedId === task.id}
                              onSelect={() => select(task.id, "task")}
                              trailing={
                                <button
                                  type="button"
                                  data-testid={`backlog-task-unassign-${task.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleUnassign(task.id);
                                  }}
                                  className="text-xs text-muted hover:text-danger px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                  title="Remove from cycle"
                                  aria-label="Remove from cycle"
                                >
                                  &times;
                                </button>
                              }
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </DroppableSection>
            );
          })}

          {/* Backlog (unassigned) — same card style as cycle sections */}
          <DroppableSection id={BACKLOG_DROP_ID}>
            {(isOver) => (
              <div
                data-testid="backlog-section"
                data-section-id={BACKLOG_DROP_ID}
                data-section-kind="backlog"
                data-is-over={isOver || undefined}
                className={cn(
                  "rounded-lg border bg-surface overflow-hidden mt-2 transition-colors",
                  isOver ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-high">
                  <button
                    type="button"
                    onClick={() => setCollapsedBacklog((v) => !v)}
                    aria-expanded={!collapsedBacklog}
                    data-testid={`backlog-section-toggle-${BACKLOG_DROP_ID}`}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <span aria-hidden className="text-muted text-xs shrink-0">
                      {collapsedBacklog ? "▶" : "▼"}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">
                      Backlog
                    </span>
                    <span
                      data-testid={`backlog-section-count-${BACKLOG_DROP_ID}`}
                      className="text-xs text-muted shrink-0 tabular-nums"
                    >
                      {backlogTasks.length} items
                    </span>
                  </button>
                </div>

                {!collapsedBacklog &&
                  (backlogTasks.length === 0 ? (
                    <div
                      data-testid={`backlog-section-empty-${BACKLOG_DROP_ID}`}
                      className="px-4 py-3 text-sm text-muted italic"
                    >
                      All tasks are assigned to cycles.
                    </div>
                  ) : (
                    <div
                      data-testid={`backlog-section-list-${BACKLOG_DROP_ID}`}
                      className="max-h-[60vh] overflow-y-auto"
                    >
                      {backlogTasks.map((task, i) => (
                        <DraggableTaskRow
                          key={task.id}
                          task={task}
                          showBorder={i > 0}
                          selected={selectedId === task.id}
                          onSelect={() => select(task.id, "task")}
                          trailing={
                            <div
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {assigningTaskId === task.id ? (
                                <select
                                  data-testid={`backlog-task-cycle-select-${task.id}`}
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      void handleAssignCycle(
                                        task.id,
                                        e.target.value,
                                      );
                                    } else {
                                      setAssigningTaskId(null);
                                    }
                                  }}
                                  onBlur={() => setAssigningTaskId(null)}
                                  autoFocus
                                  className={cn(
                                    "w-36 rounded-md border border-border bg-background",
                                    "px-2 py-1 text-xs text-foreground",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                  )}
                                >
                                  <option value="">Select cycle…</option>
                                  {activeCycles.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  data-testid={`backlog-task-assign-${task.id}`}
                                  onClick={() => setAssigningTaskId(task.id)}
                                  className={cn(
                                    "text-xs text-muted hover:text-primary",
                                    "px-2 py-1 rounded border border-transparent hover:border-border",
                                    "transition-colors whitespace-nowrap cursor-pointer",
                                  )}
                                >
                                  + Cycle
                                </button>
                              )}
                            </div>
                          }
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </DroppableSection>
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="flex items-center gap-3 px-4 py-2 bg-surface border border-primary rounded-lg shadow-lg opacity-90">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  priorityDotClass(activeTask.priority),
                )}
              />
              {activeTask.ticket_number && (
                <span className="font-mono text-xs text-muted shrink-0 w-16">
                  {activeTask.ticket_number}
                </span>
              )}
              <span className="text-sm text-foreground truncate flex-1">
                {activeTask.title}
              </span>
              <TaskStatusBadge status={activeTask.status} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ViewShell>
  );
}
