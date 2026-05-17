// TimelineView — desktop mirror of clawket/web's TimelineView.
//
// Visual & structural identity with the web dashboard:
//   - Top: header + Swimlane/Activity tab switcher (matches web).
//   - Below: active-cycle progress band (segmented bar + caption).
//   - Tab=swimlane: per-agent vertical run tracks + legend + hover detail +
//     dependency/blocked task callouts. Sub-component: `./timeline/Swimlane`.
//   - Tab=activity: day-grouped event stream with icons / time stamps. Sub-
//     component: `./timeline/ActivityStream`.
//
// Differences vs web:
//   - Data flows in via `useData()` rather than direct `api.*` calls — the
//     DataProvider already streams runs + timeline via SSE so we keep one
//     source of truth for the renderer.
//   - The active-cycle's task list is fetched on demand via `listCycleTasks`
//     (not cached) because it's only needed by this view, and the daemon's
//     `/cycles/:id/tasks` is keyed off the cycle id so the round-trip is
//     cheap.
//   - Task lookups for runs (title + ticket) are done against the cached
//     `tasks` list in DataProvider instead of N round-trips to `GET /tasks/:id`
//     — desktop already has the full task set in memory.
//   - Task selection integrates with the desktop DetailDrawer via the
//     `onSelectTask` shell binding (URL-less; web uses route navigation).

import { useEffect, useMemo, useState } from "react";
import { cn } from "@clawket/ui";
import { ViewShell } from "./ViewShell";
import { ActivityStream } from "./timeline/ActivityStream";
import { CycleProgress, deriveCycleProgress } from "./timeline/CycleProgress";
import { Swimlane, type SwimlaneRun } from "./timeline/Swimlane";
import { useData } from "../data/DataProvider";
import { useSelection } from "../shell/selection";
import type { Cycle, Task } from "../data/types";

type ViewTab = "swimlane" | "activity";

export interface TimelineViewProps {
  /**
   * Optional click-through handler for runs / activity events that target a
   * task. When omitted the view falls back to the shell's `useSelection()`
   * hook, which opens the DetailDrawer in the running app. Tests pass an
   * explicit handler to assert click semantics without mounting the selection
   * provider.
   */
  onSelectTask?: (taskId: string) => void;
}

function pickActiveCycle(cycles: Cycle[]): Cycle | null {
  return cycles.find((c) => c.status === "active") ?? null;
}

export function TimelineView({ onSelectTask }: TimelineViewProps = {}) {
  const {
    status,
    error,
    runs,
    timeline,
    tasks,
    cycles,
    listCycleTasks,
  } = useData();
  const [tab, setTab] = useState<ViewTab>("swimlane");
  const [cycleTasks, setCycleTasks] = useState<Task[] | null>(null);
  // Pull `select` regardless of whether `onSelectTask` was supplied so that
  // the hook order stays stable across renders. The fallback closure only
  // invokes `select` when no explicit handler was passed.
  const { select } = useSelection();
  const handleSelectTask = useMemo(
    () => onSelectTask ?? ((id: string) => select(id, "task")),
    [onSelectTask, select],
  );

  // Resolve the active cycle (if any) and lazy-load its task list. Refetch
  // whenever the active cycle id changes — the daemon owns task status, so
  // we don't try to derive cycle progress from local `tasks` (which is the
  // full project task set, not cycle-scoped).
  const activeCycle = useMemo(() => pickActiveCycle(cycles), [cycles]);
  useEffect(() => {
    if (!activeCycle) {
      setCycleTasks(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const t = await listCycleTasks(activeCycle.id);
        if (!cancelled) setCycleTasks(t);
      } catch {
        // Soft-fail: the meter just won't render. The rest of the view stays.
        if (!cancelled) setCycleTasks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCycle, listCycleTasks]);

  // Decorate runs with task title / ticket from the cached task list so the
  // swimlane hover detail can show ticket numbers without a per-task fetch.
  const swimlaneRuns: SwimlaneRun[] = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    return runs.map((r) => {
      const t = taskById.get(r.task_id);
      return {
        ...r,
        taskTitle: t?.title ?? r.task_id,
        taskTicket: t?.ticket_number ?? undefined,
      };
    });
  }, [runs, tasks]);

  const cycleProgress = useMemo(() => {
    if (!activeCycle || cycleTasks === null) return null;
    return deriveCycleProgress(activeCycle, cycleTasks);
  }, [activeCycle, cycleTasks]);

  if (status === "loading" || status === "idle") {
    return (
      <ViewShell title="Timeline" subtitle="Loading…" testId="view-timeline">
        <div className="p-6 text-body-sm text-muted">Loading data…</div>
      </ViewShell>
    );
  }
  if (status === "error") {
    return (
      <ViewShell
        title="Timeline"
        subtitle="Failed to load"
        testId="view-timeline"
      >
        <div
          data-testid="timeline-error"
          className="p-6 text-body-sm text-danger"
        >
          {error ?? "Unknown error"}
        </div>
      </ViewShell>
    );
  }

  const subtitle =
    tab === "swimlane"
      ? `${runs.length} runs`
      : `${timeline.length} events`;

  return (
    <ViewShell
      title="Timeline"
      subtitle={subtitle}
      testId="view-timeline"
      actions={<TabSwitcher tab={tab} onChange={setTab} />}
    >
      <div className="flex h-full min-h-0 flex-col gap-4 px-6 py-4">
        {cycleProgress && <CycleProgress data={cycleProgress} />}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "swimlane" ? (
            <SwimlaneTab
              runs={swimlaneRuns}
              cycleTasks={cycleProgress?.tasks ?? null}
              onSelectTask={handleSelectTask}
            />
          ) : (
            <ActivityStream
              events={timeline}
              onSelectTask={handleSelectTask}
            />
          )}
        </div>
      </div>
    </ViewShell>
  );
}

// ── Tab switcher ──────────────────────────────────────────────────────────

interface TabSwitcherProps {
  tab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

function TabSwitcher({ tab, onChange }: TabSwitcherProps) {
  const tabs: { id: ViewTab; label: string }[] = [
    { id: "swimlane", label: "Swimlane" },
    { id: "activity", label: "Activity" },
  ];
  return (
    <div
      data-testid="timeline-tab-switcher"
      className="flex gap-1 bg-surface-high rounded-lg p-0.5"
    >
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            type="button"
            key={t.id}
            data-testid={`timeline-tab-${t.id}`}
            data-active={active || undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              "px-3 py-1 text-label-sm rounded-md transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Swimlane tab body ─────────────────────────────────────────────────────
//
// Wraps the Swimlane sub-component together with the dependency / blocked
// callout panel that lives below the lane grid (mirrors web's layout). The
// blocked panel only renders when the active cycle has at least one blocked
// task or one task with depends_on edges.

interface SwimlaneTabProps {
  runs: SwimlaneRun[];
  cycleTasks: Task[] | null;
  onSelectTask: (taskId: string) => void;
}

function SwimlaneTab({ runs, cycleTasks, onSelectTask }: SwimlaneTabProps) {
  return (
    <div data-testid="timeline-swimlane-tab" className="flex flex-col gap-3">
      <Swimlane runs={runs} onSelectTask={onSelectTask} />
      {cycleTasks && (
        <DependencyPanel tasks={cycleTasks} onSelectTask={onSelectTask} />
      )}
    </div>
  );
}

interface DependencyPanelProps {
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
}

function DependencyPanel({ tasks, onSelectTask }: DependencyPanelProps) {
  const blocked = tasks.filter((t) => t.status === "blocked");
  const withDeps = tasks.filter(
    (t) => t.depends_on && t.depends_on.length > 0,
  );
  if (blocked.length === 0 && withDeps.length === 0) return null;
  return (
    <div
      data-testid="timeline-dependency-panel"
      className="p-3 bg-surface border border-border rounded-lg"
    >
      {blocked.length > 0 ? (
        <div className={cn(withDeps.length > 0 && "mb-2")}>
          <span className="text-label-sm font-medium text-danger">
            Blocked ({blocked.length})
          </span>
          {blocked.map((t) => {
            const blockers = tasks.filter((b) =>
              (t.depends_on ?? []).includes(b.id),
            );
            return (
              <div
                key={t.id}
                data-testid="timeline-blocked-row"
                className="flex items-center gap-2 mt-1 text-label-sm"
              >
                <span aria-hidden className="text-danger">
                  ⊘
                </span>
                <button
                  type="button"
                  onClick={() => onSelectTask(t.id)}
                  className="text-foreground hover:text-primary cursor-pointer"
                >
                  {t.ticket_number ? `${t.ticket_number} ` : ""}
                  {t.title}
                </button>
                {blockers.length > 0 && (
                  <span className="text-muted">
                    ← blocked by{" "}
                    {blockers
                      .map((b) => b.ticket_number ?? b.id.slice(-6))
                      .join(", ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <span className="text-label-sm font-medium text-muted">
            Dependencies ({withDeps.length} tasks with depends_on)
          </span>
        </div>
      )}
    </div>
  );
}
