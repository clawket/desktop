// TaskRunsPanel — read-only history of execution runs for a single task.
//
// Wire facts:
//   - GET /runs?task_id=:id returns Run[] (daemon repo::runs::list).
//   - Runs are auto-created by the Claude Code adapter on task start/stop.
//     The desktop does not mutate them — the panel is purely a history view.
//   - `status` is one of: pending / started / finished. `result` is set only
//     after the run finishes (success / error / cancelled / interrupted).
//   - Each entry shows agent, status, started_at, ended_at, result. Notes are
//     rendered below when present.

import { useCallback, useEffect, useState } from "react";
import { Badge, cn } from "@clawket/ui";
import type { Run } from "../data/types";

export interface TaskRunsPanelProps {
  taskId: string;
  onList: (taskId: string) => Promise<Run[]>;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "ongoing";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function resultVariant(
  result: string | null,
): "success" | "danger" | "warning" | "neutral" {
  if (result === "success") return "success";
  if (result === "error" || result === "failed") return "danger";
  if (result === "cancelled" || result === "interrupted") return "warning";
  return "neutral";
}

function statusVariant(status: string): "success" | "warning" | "neutral" {
  if (status === "finished") return "success";
  if (status === "started") return "warning";
  return "neutral";
}

export function TaskRunsPanel({ taskId, onList }: TaskRunsPanelProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setErr(null);
    try {
      const list = await onList(taskId);
      // Newest first so the active/most-recent run is at the top. Daemon
      // returns started_at-ascending; we reverse here rather than passing a
      // query param (the route doesn't accept one).
      setRuns([...list].sort((a, b) => b.started_at.localeCompare(a.started_at)));
    } catch (e) {
      setErr((e as Error).message || "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [onList, taskId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  return (
    <div data-testid="task-detail-runs" className="flex flex-col gap-3">
      {err && (
        <p
          role="alert"
          data-testid="task-detail-runs-error"
          className="text-body-sm text-error"
        >
          {err}
        </p>
      )}
      {loading ? (
        <p
          data-testid="task-detail-runs-loading"
          className="text-body-sm text-subtle"
        >
          Loading runs…
        </p>
      ) : runs.length === 0 ? (
        <p
          data-testid="task-detail-runs-empty"
          className="text-body-sm text-subtle"
        >
          No runs recorded.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li
              key={r.id}
              data-testid={`task-detail-run-${r.id}`}
              className={cn(
                "rounded-md border border-border bg-surface-high p-3",
                "flex flex-col gap-1",
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(r.status)} size="sm">
                    {r.status}
                  </Badge>
                  {r.result && (
                    <Badge variant={resultVariant(r.result)} size="sm">
                      {r.result}
                    </Badge>
                  )}
                  <span className="text-label-sm font-semibold text-foreground">
                    {r.agent}
                  </span>
                </div>
                <span className="text-label-sm text-subtle">
                  {formatDuration(r.started_at, r.ended_at)}
                </span>
              </header>
              <p className="text-label-sm text-subtle">
                started {formatTimestamp(r.started_at)} · ended{" "}
                {formatTimestamp(r.ended_at)}
              </p>
              {r.notes && (
                <p className="whitespace-pre-line text-body-sm text-foreground">
                  {r.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
