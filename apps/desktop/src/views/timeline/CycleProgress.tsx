// Cycle-progress meter shown at the top of TimelineView.
//
// Mirrors the web dashboard's cycle progress band (clawket/web/src/components/
// TimelineView.tsx, lines ~258-288). Renders the active cycle's done /
// in-progress / blocked task counts as a segmented horizontal bar plus a
// human-readable "X% complete · started Y · ~Z remaining" caption.
//
// Closed-status / blocked semantics: web exports `CLOSED_STATUSES` from
// `../types` (a Set containing `done`, `cancelled`). Desktop's TaskStatus
// union already names the closed statuses so we use a local literal Set
// here rather than re-export — keeps this sub-view dependency-free w.r.t.
// the broader data layer (`useData()` lives in the parent).

import { cn } from "@clawket/ui";
import type { Cycle, Task } from "../../data/types";
import { formatDate, formatDuration, toMs } from "./format";

const CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);

export interface CycleProgressData {
  cycle: Cycle;
  tasks: Task[];
  done: number;
  inProgress: number;
  blocked: number;
  total: number;
}

export function deriveCycleProgress(
  cycle: Cycle,
  tasks: Task[],
): CycleProgressData {
  let done = 0;
  let inProgress = 0;
  let blocked = 0;
  for (const t of tasks) {
    if (CLOSED_TASK_STATUSES.has(t.status)) done += 1;
    else if (t.status === "in_progress") inProgress += 1;
    else if (t.status === "blocked") blocked += 1;
  }
  return {
    cycle,
    tasks,
    done,
    inProgress,
    blocked,
    total: tasks.length,
  };
}

export interface CycleProgressProps {
  data: CycleProgressData;
}

export function CycleProgress({ data }: CycleProgressProps) {
  const { cycle, done, inProgress, blocked, total } = data;
  if (total === 0) {
    return (
      <div
        data-testid="timeline-cycle-progress"
        className="bg-surface rounded-lg border border-border p-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-body-sm font-medium text-foreground">
            {cycle.title}
          </span>
          <span className="text-label-sm text-muted">no tasks yet</span>
        </div>
      </div>
    );
  }
  const doneWidth = (done / total) * 100;
  const inProgressWidth = (inProgress / total) * 100;
  const blockedWidth = (blocked / total) * 100;
  const percent = (Math.floor((done * 10000) / total) / 100).toFixed(2);
  const startedAtMs = cycle.started_at ? toMs(cycle.started_at) : NaN;
  const remainingMs =
    Number.isFinite(startedAtMs) && done > 0 && total - done > 0
      ? ((Date.now() - startedAtMs) / done) * (total - done)
      : null;
  return (
    <div
      data-testid="timeline-cycle-progress"
      className="bg-surface rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-sm font-medium text-foreground">
          {cycle.title}
        </span>
        <span className="text-label-sm text-muted">
          <span data-testid="timeline-cycle-progress-counts">
            {done}/{total} done
          </span>
          {inProgress > 0 && ` · ${inProgress} active`}
          {blocked > 0 && ` · ${blocked} blocked`}
        </span>
      </div>
      <div
        data-testid="timeline-cycle-progress-bar"
        className={cn(
          "w-full h-2 rounded-full overflow-hidden flex",
          "bg-surface-high",
        )}
      >
        {done > 0 && (
          <div
            data-testid="timeline-cycle-progress-bar-done"
            className="bg-success h-full"
            style={{ width: `${doneWidth}%` }}
          />
        )}
        {inProgress > 0 && (
          <div
            data-testid="timeline-cycle-progress-bar-in-progress"
            className="bg-warning h-full"
            style={{ width: `${inProgressWidth}%` }}
          />
        )}
        {blocked > 0 && (
          <div
            data-testid="timeline-cycle-progress-bar-blocked"
            className="bg-danger h-full"
            style={{ width: `${blockedWidth}%` }}
          />
        )}
      </div>
      {cycle.started_at && (
        <div className="text-[10px] text-muted mt-1">
          <span data-testid="timeline-cycle-progress-percent">{percent}%</span>{" "}
          complete · started {formatDate(cycle.started_at)}
          {remainingMs !== null &&
            ` · ~${formatDuration(remainingMs)} remaining`}
        </div>
      )}
    </div>
  );
}
