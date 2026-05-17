import {
  AgentTag,
  EvidenceChip,
  StatusPill,
  TierMark,
  cn,
  type TaskStatus,
  type Tier,
} from "@clawket/ui";
import { ViewShell } from "./ViewShell";
import { useData } from "../data/DataProvider";
import type {
  Plan,
  Task,
  TimelineEvent,
  Unit,
} from "../data/types";

const KPI_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];

const DEFAULT_TIER: Tier = "med";

function formatRelative(input: string | number | null, now = new Date()): string {
  if (input === null) return "";
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.round((now.getTime() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function taskLastTouched(t: Task): string | null {
  return t.completed_at ?? t.started_at ?? t.created_at ?? null;
}

interface KpiCardProps {
  status: TaskStatus;
  count: number;
}

function KpiCard({ status, count }: KpiCardProps) {
  return (
    <div
      data-testid={`kpi-${status}`}
      className={cn(
        "rounded-lg border border-border bg-surface",
        "px-4 py-3",
        "flex items-center justify-between gap-3",
      )}
    >
      <StatusPill status={status} />
      <span className="text-headline-md font-semibold text-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

interface OverallProgressCardProps {
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
  total: number;
}

function OverallProgressCard({
  done,
  inProgress,
  todo,
  blocked,
  total,
}: OverallProgressCardProps) {
  const percent =
    total > 0 ? (Math.floor((done * 10000) / total) / 100).toFixed(2) : "0.00";
  const segTotal = done + inProgress + todo + blocked;
  const pDone = segTotal > 0 ? (done / segTotal) * 100 : 0;
  const pInProgress = segTotal > 0 ? (inProgress / segTotal) * 100 : 0;
  const pBlocked = segTotal > 0 ? (blocked / segTotal) * 100 : 0;

  return (
    <section
      data-testid="overall-progress"
      aria-label="Overall progress"
      className={cn(
        "rounded-lg border border-border bg-surface",
        "p-4 flex flex-col gap-3",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium text-foreground">
          Overall Progress
        </span>
        <span
          data-testid="overall-progress-percent"
          className="text-body-sm font-semibold text-primary tabular-nums"
        >
          {percent}%
        </span>
      </div>
      <div
        aria-hidden
        className="w-full h-2 rounded-full bg-surface-high overflow-hidden flex"
      >
        {pDone > 0 && (
          <div className="bg-success h-full" style={{ width: `${pDone}%` }} />
        )}
        {pInProgress > 0 && (
          <div
            className="bg-warning h-full"
            style={{ width: `${pInProgress}%` }}
          />
        )}
        {pBlocked > 0 && (
          <div className="bg-danger h-full" style={{ width: `${pBlocked}%` }} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-label-sm text-muted">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="w-2 h-2 rounded-full bg-success" />
          Closed {done}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="w-2 h-2 rounded-full bg-warning" />
          Active {inProgress}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="w-2 h-2 rounded-full bg-surface-high" />
          Todo {todo}
        </span>
        {blocked > 0 && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="w-2 h-2 rounded-full bg-danger" />
            Blocked {blocked}
          </span>
        )}
      </div>
    </section>
  );
}

interface ActiveTaskCardProps {
  task: Task;
}

function ActiveTaskCard({ task }: ActiveTaskCardProps) {
  const ticket = task.ticket_number ?? task.id;
  return (
    <article
      data-testid="active-task-card"
      data-ticket={ticket}
      className={cn(
        "rounded-lg border border-border bg-surface",
        "p-5",
        "flex flex-col gap-3",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label-sm uppercase tracking-wide text-muted">
            Active task · {ticket}
          </p>
          <h3 className="text-headline-md font-semibold text-foreground mt-1">
            {task.title}
          </h3>
        </div>
        <TierMark tier={(task.tier as Tier | undefined) ?? DEFAULT_TIER} showPrefix />
      </header>
      {task.body && (
        <p className="text-body-sm text-muted leading-relaxed line-clamp-3">
          {task.body}
        </p>
      )}
      <footer className="flex flex-wrap items-center gap-2 pt-2">
        <StatusPill status={task.status} />
        <AgentTag agent={task.assignee ?? task.agent_id ?? "unassigned"} />
        <EvidenceChip hasEvidence={!!task.evidence} />
        <span className="ml-auto text-label-sm text-muted">
          Updated {formatRelative(taskLastTouched(task))}
        </span>
      </footer>
    </article>
  );
}

interface TimelineRowProps {
  event: TimelineEvent;
}

function TimelineRow({ event }: TimelineRowProps) {
  const [, change] = event.event_type.split(":");
  const detail = event.detail as { ticket?: string; summary?: string };
  return (
    <li className="relative pl-6 pb-5 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5",
          "h-2.5 w-2.5 rounded-full",
          change === "done" && "bg-success",
          change === "cancelled" && "bg-danger",
          change === "blocked" && "bg-warning",
          change === "started" && "bg-accent",
          change === "created" && "bg-primary",
          change === "updated" && "bg-muted",
          change === "deleted" && "bg-danger",
        )}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-label-sm uppercase tracking-wide text-muted">
            {formatRelative(event.created_at)}
          </span>
          {event.actor && <AgentTag agent={event.actor} />}
          <span className="text-label-sm text-muted font-mono">
            {event.event_type}
          </span>
        </div>
        <p className="text-body-sm text-foreground">
          {detail?.ticket && (
            <span className="font-mono text-muted">{detail.ticket} </span>
          )}
          {event.entity_title}
        </p>
        {detail?.summary && (
          <p className="text-label-sm text-muted">{detail.summary}</p>
        )}
      </div>
    </li>
  );
}

function findActivePlan(plans: Plan[]): Plan | null {
  return plans.find((p) => p.status === "active") ?? plans[0] ?? null;
}

function findActiveCycleAndUnit(
  cycles: { id: string; unit_id: string | null; status: string }[],
  units: Unit[],
): { unitTitle: string | null } {
  const active = cycles.find((c) => c.status === "active");
  if (!active) return { unitTitle: null };
  const unit = units.find((u) => u.id === active.unit_id);
  return { unitTitle: unit?.title ?? null };
}

export function SummaryView() {
  const { status, error, plans, units, cycles, tasks, timeline } = useData();

  if (status === "loading" || status === "idle") {
    return (
      <ViewShell title="Summary" subtitle="Loading…" testId="view-summary">
        <div className="p-6 text-body-sm text-muted">Loading data…</div>
      </ViewShell>
    );
  }
  if (status === "error") {
    return (
      <ViewShell
        title="Summary"
        subtitle="Failed to load"
        testId="view-summary"
      >
        <div
          data-testid="summary-error"
          className="p-6 text-body-sm text-danger"
        >
          {error ?? "Unknown error"}
        </div>
      </ViewShell>
    );
  }

  const counts: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };
  for (const t of tasks) counts[t.status] += 1;

  const activePlan = findActivePlan(plans);
  const activeTask =
    tasks.find((t) => t.status === "in_progress") ?? tasks[0] ?? null;
  const recentEvents = timeline.slice(0, 5);
  const { unitTitle } = findActiveCycleAndUnit(cycles, units);

  const subtitle = activePlan ? activePlan.title : "No active plan";

  return (
    <ViewShell title="Summary" subtitle={subtitle} testId="view-summary">
      <div className="p-6 flex flex-col gap-6">
        <OverallProgressCard
          done={counts.done}
          inProgress={counts.in_progress}
          todo={counts.todo}
          blocked={counts.blocked}
          total={tasks.length}
        />
        <section
          aria-label="KPI strip"
          data-testid="kpi-strip"
          className="grid grid-cols-2 gap-3 md:grid-cols-5"
        >
          {KPI_STATUSES.map((s) => (
            <KpiCard key={s} status={s} count={counts[s]} />
          ))}
        </section>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section
            aria-label="Now active"
            className="lg:col-span-2 flex flex-col gap-4"
          >
            <header className="flex items-end justify-between">
              <h2 className="text-headline-md font-semibold text-foreground">
                Now active
              </h2>
              {unitTitle && (
                <p className="text-label-sm text-muted">{unitTitle}</p>
              )}
            </header>
            {activeTask ? (
              <ActiveTaskCard task={activeTask} />
            ) : (
              <p
                data-testid="no-active-task"
                className="text-body-sm text-muted italic"
              >
                No tasks in this project yet.
              </p>
            )}
            <section
              aria-label="Other in-progress tasks"
              className="flex flex-col gap-2"
            >
              {tasks
                .filter(
                  (t) =>
                    t.status === "in_progress" &&
                    activeTask !== null &&
                    t.id !== activeTask.id,
                )
                .map((t) => {
                  const ticket = t.ticket_number ?? t.id;
                  return (
                    <div
                      key={t.id}
                      data-testid="in-progress-row"
                      data-ticket={ticket}
                      className={cn(
                        "rounded-md border border-border bg-surface",
                        "px-3 py-2",
                        "flex items-center gap-2",
                      )}
                    >
                      <span className="font-mono text-label-sm text-muted">
                        {ticket}
                      </span>
                      <span className="text-body-sm text-foreground min-w-0 flex-1 truncate">
                        {t.title}
                      </span>
                      <AgentTag
                        agent={t.assignee ?? t.agent_id ?? "unassigned"}
                      />
                    </div>
                  );
                })}
            </section>
          </section>
          <section
            aria-label="Recent activity"
            data-testid="recent-activity"
            className="flex flex-col gap-3"
          >
            <h2 className="text-headline-md font-semibold text-foreground">
              Recent activity
            </h2>
            {recentEvents.length === 0 ? (
              <p
                data-testid="no-recent-activity"
                className="text-body-sm text-muted italic"
              >
                No activity yet.
              </p>
            ) : (
              <ol className="relative border-l border-border pl-2">
                {recentEvents.map((e) => (
                  <TimelineRow key={e.id} event={e} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </ViewShell>
  );
}
