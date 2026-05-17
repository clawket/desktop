import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Badge,
  Button,
  StatusPill,
  TaskDetail,
  cn,
  type BadgeProps,
  type TaskStatus,
  type Tier,
} from "@clawket/ui";
import type { SelectableKind, SelectedKind } from "./selection";
import type {
  Cycle,
  DecompositionResult,
  Plan,
  Question,
  Run,
  Task,
  TaskComment,
  Unit,
} from "../data/types";
import type {
  AnswerQuestionInput,
  CreateCommentInput,
  CreateCycleInput,
  CreateQuestionInput,
  CreateSubtaskInput,
  CreateUnitInput,
  DecomposeTaskArgs,
  UpdateCyclePatch,
  UpdatePlanPatch,
  UpdateTaskPatch,
  UpdateUnitPatch,
} from "../data/api";
import { TaskCommentsPanel } from "./TaskCommentsPanel";
import { TaskQuestionsPanel } from "./TaskQuestionsPanel";
import { TaskRunsPanel } from "./TaskRunsPanel";
import {
  DetailBreadcrumb,
  type DetailBreadcrumbItem,
  type DetailBreadcrumbKind,
} from "./DetailBreadcrumb";
import { PlanEditModal } from "./PlanEditModal";
import { UnitCreateModal } from "./UnitCreateModal";
import { UnitEditModal } from "./UnitEditModal";
import { CycleCreateModal } from "./CycleCreateModal";
import { CycleEditModal } from "./CycleEditModal";
import { TaskEditModal } from "./TaskEditModal";
import { TaskStatusModal } from "./TaskStatusModal";
import { SubtaskCreateModal } from "./SubtaskCreateModal";
import SuggestionPanel from "../features/decomposition/SuggestionPanel";

const DEFAULT_TIER: Tier = "med";
const KPI_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];

function emptyCounts(): Record<TaskStatus, number> {
  return { todo: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 };
}

function unitsOfPlan(planId: string, units: Unit[]): Unit[] {
  return units
    .filter((u) => u.plan_id === planId)
    .slice()
    .sort((a, b) => a.idx - b.idx);
}

function tasksOfUnit(unitId: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.unit_id === unitId)
    .slice()
    .sort((a, b) => a.idx - b.idx);
}

function tasksOfPlan(planId: string, units: Unit[], tasks: Task[]): Task[] {
  const unitIds = new Set(unitsOfPlan(planId, units).map((u) => u.id));
  return tasks.filter((t) => unitIds.has(t.unit_id));
}

function tasksOfCycle(cycleId: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.cycle_id === cycleId)
    .slice()
    .sort((a, b) => a.idx - b.idx);
}

function countByStatus(items: Task[]): Record<TaskStatus, number> {
  const out = emptyCounts();
  for (const t of items) out[t.status] += 1;
  return out;
}

function cyclesOfUnit(unitId: string, cycles: Cycle[]): Cycle[] {
  return cycles
    .filter((c) => c.unit_id === unitId)
    .slice()
    .sort((a, b) => a.idx - b.idx);
}

function findActiveCycleForUnit(cycles: Cycle[], unitId: string): Cycle | null {
  return (
    cycles.find((c) => c.unit_id === unitId && c.status === "active") ?? null
  );
}

function taskTicket(t: Task): string {
  return t.ticket_number ?? t.id;
}

function taskAgent(t: Task): string {
  return t.assignee ?? t.agent_id ?? "unassigned";
}

function taskTier(t: Task): Tier {
  return (t.tier as Tier | undefined) ?? DEFAULT_TIER;
}

function planTicket(p: Plan): string {
  return p.id;
}

function unitTicket(u: Unit): string {
  return u.id;
}

function cycleTicket(c: Cycle): string {
  return c.id;
}

function cycleStatusVariant(
  status: Cycle["status"],
): "accent" | "info" | "success" | "neutral" {
  if (status === "active") return "success";
  if (status === "planning") return "info";
  return "neutral";
}

interface NodeHeaderProps {
  kindLabel: string;
  kindVariant: "accent" | "info" | "success" | "neutral";
  ticket: string;
  title: string;
  actions?: React.ReactNode;
}

function NodeHeader({
  kindLabel,
  kindVariant,
  ticket,
  title,
  actions,
}: NodeHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 shrink-0",
        "border-b border-border bg-surface",
        "px-6 py-4",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={kindVariant} size="sm">
              {kindLabel}
            </Badge>
            <span className="font-mono text-label-sm text-muted">{ticket}</span>
          </div>
          <h1 className="mt-1 text-headline-lg font-semibold text-foreground">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}

interface PlanDetailProps {
  plan: Plan;
  units: Unit[];
  tasks: Task[];
  cycles: Cycle[];
  onApprovePlan?: (id: string) => Promise<unknown>;
  onCompletePlan?: (id: string) => Promise<unknown>;
  onUpdatePlan?: (id: string, patch: UpdatePlanPatch) => Promise<unknown>;
  onCreateUnit?: (input: CreateUnitInput) => Promise<unknown>;
  onSelectUnit?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onSelectItem?: (item: { type: DetailBreadcrumbKind; id: string }) => void;
}

function PlanDetail({
  plan,
  units,
  tasks,
  cycles,
  onApprovePlan,
  onCompletePlan,
  onUpdatePlan,
  onCreateUnit,
  onSelectUnit,
  onSelectTask,
  onSelectItem,
}: PlanDetailProps) {
  const planUnits = unitsOfPlan(plan.id, units);
  const counts = countByStatus(tasksOfPlan(plan.id, units, tasks));
  const activeCycle =
    cycles.find(
      (c) =>
        c.status === "active" &&
        c.unit_id !== null &&
        planUnits.some((u) => u.id === c.unit_id),
    ) ?? null;
  const [editing, setEditing] = useState(false);
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleApprove() {
    if (!onApprovePlan || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onApprovePlan(plan.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to approve plan");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!onCompletePlan || busy) return;
    // Completion is irreversible — confirm before mutating.
    const ok = window.confirm(
      `Mark plan "${plan.title}" as completed? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onCompletePlan(plan.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to complete plan");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(
    id: string,
    patch: UpdatePlanPatch,
  ): Promise<void> {
    if (!onUpdatePlan) return;
    await onUpdatePlan(id, patch);
    setEditing(false);
  }

  async function handleCreateUnit(input: CreateUnitInput): Promise<void> {
    if (!onCreateUnit) return;
    await onCreateUnit(input);
    setCreatingUnit(false);
  }

  return (
    <TaskDetail.Root data-testid="plan-detail" data-id={plan.id}>
      <NodeHeader
        kindLabel={`plan · ${plan.status}`}
        kindVariant="accent"
        ticket={planTicket(plan)}
        title={plan.title}
        actions={
          <>
            {plan.status === "draft" && onApprovePlan && (
              <Button
                variant="primary"
                size="sm"
                data-testid="plan-detail-approve"
                onClick={() => {
                  void handleApprove();
                }}
                disabled={busy}
              >
                Approve
              </Button>
            )}
            {plan.status === "active" && onCompletePlan && (
              <Button
                variant="primary"
                size="sm"
                data-testid="plan-detail-complete"
                onClick={() => {
                  void handleComplete();
                }}
                disabled={busy}
              >
                Complete
              </Button>
            )}
            {onCreateUnit && plan.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="plan-detail-new-unit"
                onClick={() => setCreatingUnit(true)}
                disabled={busy}
              >
                + Unit
              </Button>
            )}
            {onUpdatePlan && plan.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="plan-detail-edit"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                Edit
              </Button>
            )}
          </>
        }
      />
      <TaskDetail.Body>
        <DetailBreadcrumb
          items={[
            {
              type: "plan",
              id: plan.id,
              label: plan.title,
              ticket: planTicket(plan),
              status: plan.status,
            },
          ]}
          onSelectItem={onSelectItem}
        />
        {err && (
          <p
            role="alert"
            data-testid="plan-detail-error"
            className="text-body-sm text-error"
          >
            {err}
          </p>
        )}
        {plan.description && (
          <TaskDetail.Section title="Description">
            <p className="text-body-sm text-foreground whitespace-pre-line">
              {plan.description}
            </p>
          </TaskDetail.Section>
        )}
        {activeCycle && (
          <TaskDetail.Section title="Active cycle">
            <div className="flex items-center gap-2">
              <Badge variant="success" size="sm">
                {activeCycle.status}
              </Badge>
              <span className="font-mono text-label-sm text-muted">
                {activeCycle.id}
              </span>
              <span className="text-body-sm text-foreground">
                {activeCycle.title}
              </span>
            </div>
          </TaskDetail.Section>
        )}
        {planUnits.length > 0 && (
          <TaskDetail.Section title={`Units (${planUnits.length})`}>
            <ul
              data-testid="plan-detail-units"
              className="flex flex-col gap-2"
            >
              {planUnits.map((u) => {
                const unitTasks = tasksOfUnit(u.id, tasks);
                return (
                  <li key={u.id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      data-testid={`plan-detail-unit-${u.id}`}
                      onClick={() => onSelectUnit?.(u.id)}
                      disabled={!onSelectUnit}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1",
                        "text-left transition-colors",
                        onSelectUnit &&
                          "hover:border-primary/60 hover:bg-surface-high",
                        !onSelectUnit && "cursor-default",
                      )}
                    >
                      <Badge variant="info" size="sm">
                        unit
                      </Badge>
                      <span className="font-mono text-label-sm text-muted">
                        {u.id}
                      </span>
                      <span className="truncate text-body-sm text-foreground">
                        {u.title}
                      </span>
                      <span className="ml-auto shrink-0 text-label-sm text-muted">
                        {unitTasks.length} task
                        {unitTasks.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    {unitTasks.length > 0 && (
                      <ul
                        data-testid={`plan-detail-unit-${u.id}-tasks`}
                        className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2"
                      >
                        {unitTasks.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              data-testid={`plan-detail-task-${t.id}`}
                              onClick={() => onSelectTask?.(t.id)}
                              disabled={!onSelectTask}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5",
                                "text-left transition-colors",
                                onSelectTask &&
                                  "hover:bg-surface-high",
                                !onSelectTask && "cursor-default",
                              )}
                            >
                              <StatusPill status={t.status} />
                              <span className="font-mono text-label-sm text-muted">
                                {taskTicket(t)}
                              </span>
                              <span className="truncate text-body-sm text-foreground">
                                {t.title}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Task counts">
          <div className="flex flex-wrap gap-2">
            {KPI_STATUSES.map((s) => (
              <div
                key={s}
                data-testid={`plan-count-${s}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1"
              >
                <StatusPill status={s} />
                <span className="text-body-sm font-medium tabular-nums">
                  {counts[s]}
                </span>
              </div>
            ))}
          </div>
        </TaskDetail.Section>
      </TaskDetail.Body>
      {editing && onUpdatePlan && (
        <PlanEditModal
          plan={plan}
          onClose={() => setEditing(false)}
          onSubmit={handleEditSubmit}
        />
      )}
      {creatingUnit && onCreateUnit && (
        <UnitCreateModal
          planId={plan.id}
          onClose={() => setCreatingUnit(false)}
          onSubmit={handleCreateUnit}
        />
      )}
    </TaskDetail.Root>
  );
}

interface UnitDetailProps {
  unit: Unit;
  plans: Plan[];
  tasks: Task[];
  cycles: Cycle[];
  /**
   * Project id is required for cycle creation. When omitted (caller did not
   * resolve a project) the "+ New cycle" trigger is hidden.
   */
  projectId?: string | null;
  onUpdateUnit?: (id: string, patch: UpdateUnitPatch) => Promise<unknown>;
  onDeleteUnit?: (id: string) => Promise<unknown>;
  onCreateCycle?: (input: CreateCycleInput) => Promise<unknown>;
  onSelectCycle?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onSelectItem?: (item: { type: DetailBreadcrumbKind; id: string }) => void;
}

function UnitDetail({
  unit,
  plans,
  tasks,
  cycles,
  projectId,
  onUpdateUnit,
  onDeleteUnit,
  onCreateCycle,
  onSelectCycle,
  onSelectTask,
  onSelectItem,
}: UnitDetailProps) {
  const unitTasks = tasksOfUnit(unit.id, tasks);
  const counts = countByStatus(unitTasks);
  const unitCycles = cyclesOfUnit(unit.id, cycles);
  const activeCycle = findActiveCycleForUnit(cycles, unit.id);
  const [editing, setEditing] = useState(false);
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasTasksOrCycles = unitTasks.length > 0 || unitCycles.length > 0;

  async function handleDelete() {
    if (!onDeleteUnit || busy) return;
    // Refuse to delete a unit that still has tasks or cycles — the daemon
    // would let the caller orphan the children silently. Surface the guard
    // here so the user sees a clear hint to delete children first.
    if (hasTasksOrCycles) {
      setErr(
        "Cannot delete unit while it still has tasks or cycles. Delete or move children first.",
      );
      return;
    }
    const ok = window.confirm(
      `Delete unit "${unit.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onDeleteUnit(unit.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to delete unit");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(
    id: string,
    patch: UpdateUnitPatch,
  ): Promise<void> {
    if (!onUpdateUnit) return;
    await onUpdateUnit(id, patch);
    setEditing(false);
  }

  async function handleCreateCycle(input: CreateCycleInput): Promise<void> {
    if (!onCreateCycle) return;
    await onCreateCycle(input);
    setCreatingCycle(false);
  }

  return (
    <TaskDetail.Root data-testid="unit-detail" data-id={unit.id}>
      <NodeHeader
        kindLabel="unit"
        kindVariant="info"
        ticket={unitTicket(unit)}
        title={unit.title}
        actions={
          <>
            {onCreateCycle && projectId && (
              <Button
                variant="primary"
                size="sm"
                data-testid="unit-detail-new-cycle"
                onClick={() => setCreatingCycle(true)}
                disabled={busy}
              >
                + Cycle
              </Button>
            )}
            {onUpdateUnit && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="unit-detail-edit"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                Edit
              </Button>
            )}
            {onDeleteUnit && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="unit-detail-delete"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <TaskDetail.Body>
        <DetailBreadcrumb
          items={(() => {
            const plan = plans.find((p) => p.id === unit.plan_id);
            const trail: DetailBreadcrumbItem[] = [];
            if (plan) {
              trail.push({
                type: "plan",
                id: plan.id,
                label: plan.title,
                ticket: planTicket(plan),
                status: plan.status,
              });
            }
            trail.push({
              type: "unit",
              id: unit.id,
              label: unit.title,
              ticket: unitTicket(unit),
            });
            return trail;
          })()}
          onSelectItem={onSelectItem}
        />
        {err && (
          <p
            role="alert"
            data-testid="unit-detail-error"
            className="text-body-sm text-error"
          >
            {err}
          </p>
        )}
        {unit.goal && (
          <TaskDetail.Section title="Goal">
            <p className="text-body-sm text-foreground whitespace-pre-line">
              {unit.goal}
            </p>
          </TaskDetail.Section>
        )}
        {activeCycle && (
          <TaskDetail.Section title="Active cycle">
            <button
              type="button"
              data-testid={`unit-detail-cycle-${activeCycle.id}`}
              onClick={() => onSelectCycle?.(activeCycle.id)}
              disabled={!onSelectCycle}
              className={cn(
                "flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1",
                "text-left transition-colors",
                onSelectCycle &&
                  "hover:border-primary/60 hover:bg-surface-high",
                !onSelectCycle && "cursor-default",
              )}
            >
              <Badge variant="success" size="sm">
                {activeCycle.status}
              </Badge>
              <span className="text-body-sm text-foreground">
                {activeCycle.title}
              </span>
            </button>
          </TaskDetail.Section>
        )}
        {unitCycles.length > 0 && (
          <TaskDetail.Section title="Cycles">
            <ul className="flex flex-col gap-1">
              {unitCycles.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-testid={`unit-detail-cycle-row-${c.id}`}
                    onClick={() => onSelectCycle?.(c.id)}
                    disabled={!onSelectCycle}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1",
                      "text-left transition-colors",
                      onSelectCycle &&
                        "hover:border-primary/60 hover:bg-surface-high",
                      !onSelectCycle && "cursor-default",
                    )}
                  >
                    <Badge variant={cycleStatusVariant(c.status)} size="sm">
                      {c.status}
                    </Badge>
                    <span className="font-mono text-label-sm text-muted">
                      {c.id}
                    </span>
                    <span className="truncate text-body-sm text-foreground">
                      {c.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </TaskDetail.Section>
        )}
        {unitTasks.length > 0 && (
          <TaskDetail.Section title={`Tasks (${unitTasks.length})`}>
            <ul
              data-testid="unit-detail-tasks"
              className="flex flex-col gap-1"
            >
              {unitTasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    data-testid={`unit-detail-task-${t.id}`}
                    onClick={() => onSelectTask?.(t.id)}
                    disabled={!onSelectTask}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1",
                      "text-left transition-colors",
                      onSelectTask &&
                        "hover:border-primary/60 hover:bg-surface-high",
                      !onSelectTask && "cursor-default",
                    )}
                  >
                    <StatusPill status={t.status} />
                    <span className="font-mono text-label-sm text-muted">
                      {taskTicket(t)}
                    </span>
                    <span className="truncate text-body-sm text-foreground">
                      {t.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Progress">
          <div className="flex flex-wrap gap-2">
            {KPI_STATUSES.map((s) => (
              <div
                key={s}
                data-testid={`unit-count-${s}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1"
              >
                <StatusPill status={s} />
                <span className="text-body-sm font-medium tabular-nums">
                  {counts[s]}
                </span>
              </div>
            ))}
          </div>
        </TaskDetail.Section>
      </TaskDetail.Body>
      {editing && onUpdateUnit && (
        <UnitEditModal
          unit={unit}
          onClose={() => setEditing(false)}
          onSubmit={handleEditSubmit}
        />
      )}
      {creatingCycle && onCreateCycle && projectId && (
        <CycleCreateModal
          projectId={projectId}
          unitId={unit.id}
          onClose={() => setCreatingCycle(false)}
          onSubmit={handleCreateCycle}
        />
      )}
    </TaskDetail.Root>
  );
}

interface CycleDetailProps {
  cycle: Cycle;
  tasks: Task[];
  onUpdateCycle?: (id: string, patch: UpdateCyclePatch) => Promise<unknown>;
  onActivateCycle?: (id: string) => Promise<unknown>;
  onCompleteCycle?: (id: string) => Promise<unknown>;
  onDeleteCycle?: (id: string) => Promise<unknown>;
}

function CycleDetail({
  cycle,
  tasks,
  onUpdateCycle,
  onActivateCycle,
  onCompleteCycle,
  onDeleteCycle,
}: CycleDetailProps) {
  const cycleTasks = tasksOfCycle(cycle.id, tasks);
  const counts = countByStatus(cycleTasks);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleActivate() {
    if (!onActivateCycle || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onActivateCycle(cycle.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to activate cycle");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!onCompleteCycle || busy) return;
    const ok = window.confirm(
      `Mark cycle "${cycle.title}" as completed? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onCompleteCycle(cycle.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to complete cycle");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDeleteCycle || busy) return;
    if (cycleTasks.length > 0) {
      setErr(
        "Cannot delete cycle while it still has tasks. Move or delete tasks first.",
      );
      return;
    }
    const ok = window.confirm(
      `Delete cycle "${cycle.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onDeleteCycle(cycle.id);
    } catch (e) {
      setErr((e as Error).message || "Failed to delete cycle");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(
    id: string,
    patch: UpdateCyclePatch,
  ): Promise<void> {
    if (!onUpdateCycle) return;
    await onUpdateCycle(id, patch);
    setEditing(false);
  }

  return (
    <TaskDetail.Root data-testid="cycle-detail" data-id={cycle.id}>
      <NodeHeader
        kindLabel={`cycle · ${cycle.status}`}
        kindVariant={cycleStatusVariant(cycle.status)}
        ticket={cycleTicket(cycle)}
        title={cycle.title}
        actions={
          <>
            {cycle.status === "planning" && onActivateCycle && (
              <Button
                variant="primary"
                size="sm"
                data-testid="cycle-detail-activate"
                onClick={() => {
                  void handleActivate();
                }}
                disabled={busy}
              >
                Activate
              </Button>
            )}
            {cycle.status === "active" && onCompleteCycle && (
              <Button
                variant="primary"
                size="sm"
                data-testid="cycle-detail-complete"
                onClick={() => {
                  void handleComplete();
                }}
                disabled={busy}
              >
                Complete
              </Button>
            )}
            {onUpdateCycle && cycle.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="cycle-detail-edit"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                Edit
              </Button>
            )}
            {onDeleteCycle && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="cycle-detail-delete"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <TaskDetail.Body>
        {err && (
          <p
            role="alert"
            data-testid="cycle-detail-error"
            className="text-body-sm text-error"
          >
            {err}
          </p>
        )}
        {cycle.goal && (
          <TaskDetail.Section title="Goal">
            <p className="text-body-sm text-foreground whitespace-pre-line">
              {cycle.goal}
            </p>
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Task counts">
          <div className="flex flex-wrap gap-2">
            {KPI_STATUSES.map((s) => (
              <div
                key={s}
                data-testid={`cycle-count-${s}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1"
              >
                <StatusPill status={s} />
                <span className="text-body-sm font-medium tabular-nums">
                  {counts[s]}
                </span>
              </div>
            ))}
          </div>
        </TaskDetail.Section>
      </TaskDetail.Body>
      {editing && onUpdateCycle && (
        <CycleEditModal
          cycle={cycle}
          onClose={() => setEditing(false)}
          onSubmit={handleEditSubmit}
        />
      )}
    </TaskDetail.Root>
  );
}

/**
 * Renders an evidence string. Strings matching `file:line` become a clickable
 * source-link; anything else renders as plain monospace. Null / undefined
 * renders an em-dash. Mirrors `clawket/web/src/components/TaskDetail.tsx`
 * (`EvidenceValue`) for cross-surface parity.
 */
const FILE_LINE_RE = /^[\w./-]+:\d+$/;
function EvidenceValue({ value }: { value: string | null | undefined }) {
  if (value == null || value === "") {
    return <span className="text-muted">—</span>;
  }
  if (FILE_LINE_RE.test(value)) {
    return (
      <a
        href={`#evidence:${value}`}
        className="font-mono text-primary hover:underline"
        title={`source: ${value}`}
      >
        {value}
      </a>
    );
  }
  return (
    <span className="font-mono text-foreground break-all">{value}</span>
  );
}

/**
 * Renders the task's `batch_id` and, when set, an inline count of sibling
 * tasks sharing the same batch (with an expander to jump between them). Web
 * parity: `clawket/web/src/components/TaskDetail.tsx::BatchSiblingsLink`. We
 * filter from the in-memory task list rather than re-fetching — the desktop
 * already holds the full project task set.
 */
function BatchSiblingsLink({
  batchId,
  currentTaskId,
  allTasks,
  onSelectTask,
}: {
  batchId: string;
  currentTaskId: string;
  allTasks: Task[];
  onSelectTask?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const others = allTasks.filter(
    (t) => t.batch_id === batchId && t.id !== currentTaskId,
  );
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className="font-mono text-foreground">{batchId}</span>
      {others.length === 0 ? (
        <span className="text-label-sm text-muted">no siblings</span>
      ) : (
        <button
          type="button"
          className="text-label-sm text-primary hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "hide" : "show"} {others.length} task
          {others.length === 1 ? "" : "s"} in batch
        </button>
      )}
      {expanded && others.length > 0 && (
        <ul className="mt-1 flex basis-full flex-col gap-0.5 pl-2 text-label-sm">
          {others.map((t) => (
            <li key={t.id} className="font-mono">
              <button
                type="button"
                className="text-left text-primary hover:underline"
                onClick={() => onSelectTask?.(t.id)}
                title={t.title}
              >
                {t.ticket_number ?? t.id.slice(-10)} — {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

const TASK_PRIORITY_VARIANT: Record<string, BadgeProps["variant"]> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

function priorityVariant(p: string): BadgeProps["variant"] {
  return TASK_PRIORITY_VARIANT[p] ?? "neutral";
}

function formatTaskTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

interface TaskDetailPanelProps {
  task: Task;
  tasks: Task[];
  units: Unit[];
  plans: Plan[];
  cycles: Cycle[];
  onUpdateTask?: (id: string, patch: UpdateTaskPatch) => Promise<unknown>;
  onDeleteTask?: (
    id: string,
    opts?: { reason?: string },
  ) => Promise<unknown>;
  onCreateSubtask?: (
    parentId: string,
    input: CreateSubtaskInput,
  ) => Promise<unknown>;
  /**
   * POST /tasks/:id/decompose. Surfaces the daemon's `success_criteria`
   * suggestion list inside the TaskDetail panel. Optional — omit to hide the
   * suggestion section. (LM-87.)
   */
  onDecomposeTask?: (
    id: string,
    args?: DecomposeTaskArgs,
  ) => Promise<DecompositionResult>;
  onSelectTask?: (id: string) => void;
  onSelectItem?: (item: { type: DetailBreadcrumbKind; id: string }) => void;
  /** Task-scoped panels. All optional — when omitted the section is hidden. */
  onListComments?: (taskId: string) => Promise<TaskComment[]>;
  onCreateComment?: (
    taskId: string,
    input: CreateCommentInput,
  ) => Promise<TaskComment>;
  onDeleteComment?: (id: string) => Promise<void>;
  onListQuestions?: (taskId: string) => Promise<Question[]>;
  onCreateQuestion?: (input: CreateQuestionInput) => Promise<Question>;
  onAnswerQuestion?: (
    id: string,
    input: AnswerQuestionInput,
  ) => Promise<Question>;
  onListRuns?: (taskId: string) => Promise<Run[]>;
}

function childTasksOf(parentId: string, all: Task[]): Task[] {
  return all
    .filter((t) => t.parent_task_id === parentId)
    .slice()
    .sort((a, b) => a.idx - b.idx);
}

const TASK_TERMINAL_STATUSES: TaskStatus[] = ["done", "cancelled"];

function TaskDetailPanel({
  task,
  tasks,
  units,
  plans,
  cycles,
  onUpdateTask,
  onDeleteTask,
  onCreateSubtask,
  onDecomposeTask,
  onSelectTask,
  onSelectItem,
  onListComments,
  onCreateComment,
  onDeleteComment,
  onListQuestions,
  onCreateQuestion,
  onAnswerQuestion,
  onListRuns,
}: TaskDetailPanelProps) {
  const ticket = taskTicket(task);
  const hasEvidence = !!task.evidence;
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isTerminal = TASK_TERMINAL_STATUSES.includes(task.status);
  const children = childTasksOf(task.id, tasks);
  const parent = task.parent_task_id
    ? tasks.find((t) => t.id === task.parent_task_id) ?? null
    : null;

  async function handleEditSubmit(
    id: string,
    patch: UpdateTaskPatch,
  ): Promise<void> {
    if (!onUpdateTask) return;
    await onUpdateTask(id, patch);
  }

  async function handleStatusSubmit(
    id: string,
    patch: UpdateTaskPatch,
  ): Promise<void> {
    if (!onUpdateTask) return;
    await onUpdateTask(id, patch);
  }

  async function handleDelete() {
    if (!onDeleteTask || busy) return;
    // Daemon: hard-delete only if todo+draft plan, otherwise transitions to
    // cancelled. We surface the same confirmation either way — the user is
    // intentionally ending the task.
    const verb = task.status === "todo" ? "delete" : "cancel";
    const ok = window.confirm(
      `${verb === "delete" ? "Delete" : "Cancel"} task "${task.title}"? ` +
        (verb === "delete"
          ? "This cannot be undone."
          : "It will be marked as cancelled with a system comment."),
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onDeleteTask(task.id);
    } catch (e) {
      setErr((e as Error).message || `Failed to ${verb} task`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TaskDetail.Root data-testid="task-detail" data-ticket={ticket}>
      <TaskDetail.Header
        ticket={ticket}
        title={task.title}
        status={task.status}
        tier={taskTier(task)}
        agent={taskAgent(task)}
        hasEvidence={hasEvidence}
        actions={
          <>
            {onUpdateTask && !isTerminal && (
              <Button
                variant="primary"
                size="sm"
                data-testid="task-detail-status"
                onClick={() => setChangingStatus(true)}
                disabled={busy}
              >
                Update status
              </Button>
            )}
            {onUpdateTask && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="task-detail-edit"
                onClick={() => setEditing(true)}
                disabled={busy || isTerminal}
              >
                Edit
              </Button>
            )}
            {onCreateSubtask && !isTerminal && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="task-detail-add-subtask"
                onClick={() => setAddingSubtask(true)}
                disabled={busy}
              >
                Add subtask
              </Button>
            )}
            {onDeleteTask && !isTerminal && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="task-detail-delete"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={busy}
              >
                {task.status === "todo" ? "Delete" : "Cancel"}
              </Button>
            )}
          </>
        }
      />
      <TaskDetail.Body>
        <DetailBreadcrumb
          items={(() => {
            const unit = units.find((u) => u.id === task.unit_id);
            const plan = unit
              ? plans.find((p) => p.id === unit.plan_id)
              : null;
            const trail: DetailBreadcrumbItem[] = [];
            if (plan) {
              trail.push({
                type: "plan",
                id: plan.id,
                label: plan.title,
                ticket: planTicket(plan),
                status: plan.status,
              });
            }
            if (unit) {
              trail.push({
                type: "unit",
                id: unit.id,
                label: unit.title,
                ticket: unitTicket(unit),
              });
            }
            trail.push({
              type: "task",
              id: task.id,
              label: task.title,
              ticket: ticket,
              status: task.status,
            });
            return trail;
          })()}
          onSelectItem={onSelectItem}
        />
        {err && (
          <p
            role="alert"
            data-testid="task-detail-error"
            className="text-body-sm text-error"
          >
            {err}
          </p>
        )}
        {(task.priority ||
          task.complexity ||
          task.estimated_edits != null) && (
          <div
            data-testid="task-detail-meta-chips"
            className="flex flex-wrap items-center gap-1.5"
          >
            {task.priority && (
              <Badge
                data-testid="task-detail-priority"
                variant={priorityVariant(task.priority)}
                size="sm"
              >
                {task.priority}
              </Badge>
            )}
            {task.complexity && (
              <Badge
                data-testid="task-detail-complexity"
                variant="accent"
                size="sm"
              >
                {task.complexity}
              </Badge>
            )}
            {task.estimated_edits != null && (
              <span
                data-testid="task-detail-estimated-edits"
                className="text-label-sm text-muted"
              >
                ~{task.estimated_edits} edits
              </span>
            )}
          </div>
        )}
        <TaskDetail.Section title="Status, assignee & cycle">
          <div
            data-testid="task-detail-status-row"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Status
              </span>
              <StatusPill status={task.status} size="sm" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Assignee
              </span>
              <span
                data-testid="task-detail-assignee"
                className="text-body-sm text-foreground"
              >
                {task.assignee ?? (
                  <span className="text-muted">Unassigned</span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Cycle
              </span>
              {(() => {
                if (!task.cycle_id) {
                  return (
                    <span
                      data-testid="task-detail-cycle"
                      className="text-body-sm text-muted"
                    >
                      Unassigned
                    </span>
                  );
                }
                const c = cycles.find((cy) => cy.id === task.cycle_id);
                if (!c) {
                  return (
                    <span
                      data-testid="task-detail-cycle"
                      className="font-mono text-label-sm text-foreground"
                    >
                      …{task.cycle_id.slice(-6)}
                    </span>
                  );
                }
                return (
                  <button
                    type="button"
                    data-testid="task-detail-cycle"
                    className={cn(
                      "text-left text-body-sm",
                      onSelectTask
                        ? "text-primary hover:underline"
                        : "text-foreground",
                    )}
                    onClick={() => onSelectTask?.(c.id)}
                    disabled={!onSelectTask}
                  >
                    #{c.idx} {c.title}
                  </button>
                );
              })()}
            </div>
          </div>
        </TaskDetail.Section>
        <TaskDetail.Section title="Timestamps">
          <dl
            data-testid="task-detail-timestamps"
            className="grid grid-cols-1 gap-x-4 gap-y-1 text-body-sm sm:grid-cols-3"
          >
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Created:</dt>
              <dd
                data-testid="task-detail-created-at"
                className="text-foreground"
              >
                {formatTaskTimestamp(task.created_at)}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Started:</dt>
              <dd
                data-testid="task-detail-started-at"
                className="text-foreground"
              >
                {formatTaskTimestamp(task.started_at)}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Completed:</dt>
              <dd
                data-testid="task-detail-completed-at"
                className="text-foreground"
              >
                {formatTaskTimestamp(task.completed_at)}
              </dd>
            </div>
          </dl>
        </TaskDetail.Section>
        <TaskDetail.Section title="PDD metadata">
          <dl
            data-testid="task-detail-pdd"
            className="flex flex-col gap-1.5 rounded-md border border-border bg-surface/50 px-3 py-2 text-body-sm"
          >
            <div className="flex items-baseline gap-2">
              <dt className="w-24 shrink-0 text-muted">Scenario ID:</dt>
              <dd
                data-testid="task-detail-scenario-id"
                className="font-mono text-foreground"
              >
                {task.scenario_id ?? (
                  <span className="font-sans text-muted">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 shrink-0 text-muted">Evidence:</dt>
              <dd data-testid="task-detail-evidence-value">
                <EvidenceValue value={task.evidence} />
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 shrink-0 text-muted">Batch ID:</dt>
              <dd data-testid="task-detail-batch-id">
                {task.batch_id ? (
                  <BatchSiblingsLink
                    batchId={task.batch_id}
                    currentTaskId={task.id}
                    allTasks={tasks}
                    onSelectTask={onSelectTask}
                  />
                ) : (
                  <span className="text-muted">—</span>
                )}
              </dd>
            </div>
          </dl>
        </TaskDetail.Section>
        {task.depends_on.length > 0 && (
          <TaskDetail.Section title="Dependencies">
            <ul
              data-testid="task-detail-depends-on"
              className="flex flex-wrap gap-1.5"
            >
              {task.depends_on.map((dep) => {
                const depTask = tasks.find((t) => t.id === dep);
                const label =
                  depTask?.ticket_number ?? `…${dep.slice(-6)}`;
                return (
                  <li key={dep}>
                    <button
                      type="button"
                      onClick={() => onSelectTask?.(dep)}
                      disabled={!onSelectTask}
                      title={depTask?.title ?? dep}
                      className={cn(
                        "rounded-sm border border-border bg-surface-high px-2 py-0.5",
                        "font-mono text-label-sm",
                        onSelectTask
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted",
                      )}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Body">
          {task.body ? (
            <div
              data-testid="task-detail-body"
              className="rounded-md border border-border bg-surface/50 p-3 text-body-sm"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.body}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-body-sm italic text-subtle">No content</p>
          )}
        </TaskDetail.Section>
        {task.labels.length > 0 && (
          <TaskDetail.Section title="Labels">
            <div className="flex flex-wrap gap-1.5">
              {task.labels.map((l) => (
                <Badge key={l} variant="neutral" size="sm">
                  {l}
                </Badge>
              ))}
            </div>
          </TaskDetail.Section>
        )}
        {parent && (
          <TaskDetail.Section title="Parent">
            <button
              type="button"
              data-testid="task-detail-parent-link"
              onClick={() => onSelectTask?.(parent.id)}
              disabled={!onSelectTask}
              className={cn(
                "text-left text-body-sm",
                onSelectTask
                  ? "text-primary hover:underline"
                  : "text-foreground",
              )}
            >
              <span className="font-mono text-label-sm text-subtle">
                {taskTicket(parent)}
              </span>{" "}
              {parent.title}
            </button>
          </TaskDetail.Section>
        )}
        {children.length > 0 && (
          <TaskDetail.Section
            title={`Subtasks (${children.length})`}
          >
            <ul
              data-testid="task-detail-subtasks"
              className="flex flex-col gap-1"
            >
              {children.map((c) => (
                <li
                  key={c.id}
                  data-testid={`task-detail-subtask-${c.id}`}
                  className="flex items-center gap-2"
                >
                  <StatusPill status={c.status} />
                  <button
                    type="button"
                    onClick={() => onSelectTask?.(c.id)}
                    disabled={!onSelectTask}
                    className={cn(
                      "text-left text-body-sm",
                      onSelectTask
                        ? "text-primary hover:underline"
                        : "text-foreground",
                    )}
                  >
                    <span className="font-mono text-label-sm text-subtle">
                      {taskTicket(c)}
                    </span>{" "}
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          </TaskDetail.Section>
        )}
        {onDecomposeTask && onCreateSubtask && !isTerminal && (
          <TaskDetail.Section title="Decomposition suggestions">
            <SuggestionPanel
              taskId={task.id}
              onDecompose={onDecomposeTask}
              onCreateSubtask={onCreateSubtask}
            />
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Evidence">
          {hasEvidence ? (
            <p className="text-body-sm text-foreground whitespace-pre-line">
              {task.evidence}
            </p>
          ) : null}
        </TaskDetail.Section>
        {onListQuestions && (
          <TaskDetail.Section title="Questions">
            <TaskQuestionsPanel
              taskId={task.id}
              onList={onListQuestions}
              onCreate={onCreateQuestion}
              onAnswer={onAnswerQuestion}
            />
          </TaskDetail.Section>
        )}
        {onListComments && (
          <TaskDetail.Section title="Comments">
            <TaskCommentsPanel
              taskId={task.id}
              onList={onListComments}
              onCreate={onCreateComment}
              onDelete={onDeleteComment}
            />
          </TaskDetail.Section>
        )}
        {onListRuns && (
          <TaskDetail.Section title="Runs">
            <TaskRunsPanel taskId={task.id} onList={onListRuns} />
          </TaskDetail.Section>
        )}
        <TaskDetail.Section title="Activity">
          {null /* Phase 5: scoped Timeline events for this task */}
        </TaskDetail.Section>
      </TaskDetail.Body>
      {editing && onUpdateTask && (
        <TaskEditModal
          task={task}
          onClose={() => setEditing(false)}
          onSubmit={async (id, patch) => {
            await handleEditSubmit(id, patch);
            setEditing(false);
          }}
        />
      )}
      {changingStatus && onUpdateTask && (
        <TaskStatusModal
          task={task}
          onClose={() => setChangingStatus(false)}
          onSubmit={async (id, patch) => {
            await handleStatusSubmit(id, patch);
          }}
        />
      )}
      {addingSubtask && onCreateSubtask && (
        <SubtaskCreateModal
          parent={task}
          onClose={() => setAddingSubtask(false)}
          onSubmit={async (parentId, input) => {
            await onCreateSubtask(parentId, input);
          }}
        />
      )}
    </TaskDetail.Root>
  );
}

interface ResolvedSelection {
  kind: SelectableKind;
  plan?: Plan;
  unit?: Unit;
  cycle?: Cycle;
  task?: Task;
}

export function resolveDetailSelection(
  selectedKind: SelectedKind,
  selectedId: string | null,
  plans: Plan[],
  units: Unit[],
  tasks: Task[],
  cycles: Cycle[] = [],
): ResolvedSelection | null {
  if (!selectedKind || !selectedId) return null;
  if (selectedKind === "plan") {
    const p = plans.find((p) => p.id === selectedId);
    if (p) return { kind: "plan", plan: p };
  }
  if (selectedKind === "unit") {
    const u = units.find((u) => u.id === selectedId);
    if (u) return { kind: "unit", unit: u };
  }
  if (selectedKind === "cycle") {
    const c = cycles.find((c) => c.id === selectedId);
    if (c) return { kind: "cycle", cycle: c };
  }
  if (selectedKind === "task") {
    const t = tasks.find((t) => t.id === selectedId);
    if (t) return { kind: "task", task: t };
  }
  return null;
}

export function detailSubtitle(sel: ResolvedSelection | null): string {
  if (!sel) return "";
  if (sel.kind === "plan") return sel.plan!.title;
  if (sel.kind === "unit") return sel.unit!.title;
  if (sel.kind === "cycle") return sel.cycle!.title;
  return sel.task!.title;
}

interface DetailPanelsProps {
  selectedKind: SelectedKind;
  selectedId: string | null;
  plans: Plan[];
  units: Unit[];
  tasks: Task[];
  cycles: Cycle[];
  activeProjectId?: string | null;
  onApprovePlan?: (id: string) => Promise<unknown>;
  onCompletePlan?: (id: string) => Promise<unknown>;
  onUpdatePlan?: (id: string, patch: UpdatePlanPatch) => Promise<unknown>;
  onCreateUnit?: (input: CreateUnitInput) => Promise<unknown>;
  onUpdateUnit?: (id: string, patch: UpdateUnitPatch) => Promise<unknown>;
  onDeleteUnit?: (id: string) => Promise<unknown>;
  onCreateCycle?: (input: CreateCycleInput) => Promise<unknown>;
  onUpdateCycle?: (id: string, patch: UpdateCyclePatch) => Promise<unknown>;
  onActivateCycle?: (id: string) => Promise<unknown>;
  onCompleteCycle?: (id: string) => Promise<unknown>;
  onDeleteCycle?: (id: string) => Promise<unknown>;
  onUpdateTask?: (id: string, patch: UpdateTaskPatch) => Promise<unknown>;
  onDeleteTask?: (
    id: string,
    opts?: { reason?: string },
  ) => Promise<unknown>;
  onCreateSubtask?: (
    parentId: string,
    input: CreateSubtaskInput,
  ) => Promise<unknown>;
  onDecomposeTask?: (
    id: string,
    args?: DecomposeTaskArgs,
  ) => Promise<DecompositionResult>;
  onListComments?: (taskId: string) => Promise<TaskComment[]>;
  onCreateComment?: (
    taskId: string,
    input: CreateCommentInput,
  ) => Promise<TaskComment>;
  onDeleteComment?: (id: string) => Promise<void>;
  onListQuestions?: (taskId: string) => Promise<Question[]>;
  onCreateQuestion?: (input: CreateQuestionInput) => Promise<Question>;
  onAnswerQuestion?: (
    id: string,
    input: AnswerQuestionInput,
  ) => Promise<Question>;
  onListRuns?: (taskId: string) => Promise<Run[]>;
  onSelectUnit?: (id: string) => void;
  onSelectCycle?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onSelectItem?: (item: { type: DetailBreadcrumbKind; id: string }) => void;
}

export function DetailPanels({
  selectedKind,
  selectedId,
  plans,
  units,
  tasks,
  cycles,
  activeProjectId,
  onApprovePlan,
  onCompletePlan,
  onUpdatePlan,
  onCreateUnit,
  onUpdateUnit,
  onDeleteUnit,
  onCreateCycle,
  onUpdateCycle,
  onActivateCycle,
  onCompleteCycle,
  onDeleteCycle,
  onUpdateTask,
  onDeleteTask,
  onCreateSubtask,
  onDecomposeTask,
  onListComments,
  onCreateComment,
  onDeleteComment,
  onListQuestions,
  onCreateQuestion,
  onAnswerQuestion,
  onListRuns,
  onSelectUnit,
  onSelectCycle,
  onSelectTask,
  onSelectItem,
}: DetailPanelsProps) {
  const resolved = resolveDetailSelection(
    selectedKind,
    selectedId,
    plans,
    units,
    tasks,
    cycles,
  );
  if (!resolved) return null;
  if (resolved.kind === "unit") {
    return (
      <UnitDetail
        unit={resolved.unit!}
        plans={plans}
        tasks={tasks}
        cycles={cycles}
        projectId={activeProjectId ?? null}
        onUpdateUnit={onUpdateUnit}
        onDeleteUnit={onDeleteUnit}
        onCreateCycle={onCreateCycle}
        onSelectCycle={onSelectCycle}
        onSelectTask={onSelectTask}
        onSelectItem={onSelectItem}
      />
    );
  }
  if (resolved.kind === "cycle") {
    return (
      <CycleDetail
        cycle={resolved.cycle!}
        tasks={tasks}
        onUpdateCycle={onUpdateCycle}
        onActivateCycle={onActivateCycle}
        onCompleteCycle={onCompleteCycle}
        onDeleteCycle={onDeleteCycle}
      />
    );
  }
  if (resolved.kind === "task") {
    return (
      <TaskDetailPanel
        task={resolved.task!}
        tasks={tasks}
        units={units}
        plans={plans}
        cycles={cycles}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onCreateSubtask={onCreateSubtask}
        onDecomposeTask={onDecomposeTask}
        onSelectTask={onSelectTask}
        onSelectItem={onSelectItem}
        onListComments={onListComments}
        onCreateComment={onCreateComment}
        onDeleteComment={onDeleteComment}
        onListQuestions={onListQuestions}
        onCreateQuestion={onCreateQuestion}
        onAnswerQuestion={onAnswerQuestion}
        onListRuns={onListRuns}
      />
    );
  }
  return (
    <PlanDetail
      plan={resolved.plan!}
      units={units}
      tasks={tasks}
      cycles={cycles}
      onApprovePlan={onApprovePlan}
      onCompletePlan={onCompletePlan}
      onUpdatePlan={onUpdatePlan}
      onCreateUnit={onCreateUnit}
      onSelectUnit={onSelectUnit}
      onSelectTask={onSelectTask}
      onSelectItem={onSelectItem}
    />
  );
}
