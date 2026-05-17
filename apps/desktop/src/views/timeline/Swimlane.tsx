// Swimlane sub-view of TimelineView.
//
// Per-agent vertical tracks of run history. Mirrors the web dashboard's
// swimlane (clawket/web/src/components/TimelineView.tsx) so the desktop
// surface stays visually and structurally identical. Differences vs web:
//   - Data flows in via props (the parent reads from `useData()` once) so
//     this component stays a pure view.
//   - `onSelectTask` integrates with desktop selection (drawer) instead of
//     web's URL-driven task drawer.
//
// Stale-run heuristic: a Run with no `ended_at` is normally a running
// session, but if it started more than STALE_RUN_MS ago we treat it as
// `session_ended` so a single orphan doesn't paint a full-height bar and
// hide every completed run below.

import { useMemo, useState } from "react";
import { cn } from "@clawket/ui";
import type { Run } from "../../data/types";
import { formatDate, formatDuration, formatTime, toMs } from "./format";

const STALE_RUN_MS = 60 * 60 * 1000; // 1h

export interface SwimlaneRun extends Run {
  taskTitle: string;
  taskTicket?: string;
}

interface RunDecorated {
  run: SwimlaneRun;
  startedMs: number;
  endMs: number;
  result: string;
  duration: number;
}

const RESULT_COLORS: Record<string, string> = {
  success: "bg-success/70",
  fail: "bg-danger/70",
  session_ended: "bg-muted/50",
  running: "bg-warning/70 animate-pulse",
};

function effectiveEnd(
  run: Run,
  now: number,
): { endMs: number; result: string } {
  const endMs = toMs(run.ended_at);
  if (Number.isFinite(endMs)) {
    return { endMs, result: run.result ?? "session_ended" };
  }
  const startedMs = toMs(run.started_at);
  if (Number.isFinite(startedMs) && now - startedMs > STALE_RUN_MS) {
    return { endMs: startedMs, result: "session_ended" };
  }
  return { endMs: now, result: run.result ?? "running" };
}

export interface SwimlaneProps {
  runs: SwimlaneRun[];
  onSelectTask: (taskId: string) => void;
}

export function Swimlane({ runs, onSelectTask }: SwimlaneProps) {
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  const agents = useMemo(() => {
    const map: Record<string, SwimlaneRun[]> = {};
    for (const r of runs) {
      (map[r.agent] ||= []).push(r);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [runs]);

  const timeRange = useMemo(() => {
    if (runs.length === 0) {
      const now = Date.now();
      return { min: now - 3_600_000, max: now, range: 3_600_000 };
    }
    const now = Date.now();
    const starts = runs.map((r) => toMs(r.started_at)).filter(Number.isFinite);
    const ends = runs
      .map((r) => effectiveEnd(r, now).endMs)
      .filter(Number.isFinite);
    const min = starts.length ? Math.min(...starts) : now - 3_600_000;
    const max = ends.length ? Math.max(...ends) : now;
    const range = max - min || 1;
    return { min, max, range };
  }, [runs]);

  if (runs.length === 0) {
    return (
      <div
        data-testid="timeline-swimlane-empty"
        className="text-center py-12 text-body-sm text-muted"
      >
        No runs yet. Agent executions will appear here.
      </div>
    );
  }

  return (
    <div data-testid="timeline-swimlane" className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-fit">
          {/* Agent label header row */}
          <div className="flex gap-2 mb-2">
            <div className="w-24 shrink-0" />
            {agents.map(([agent, agentRuns]) => (
              <div key={agent} className="w-24 shrink-0 text-center">
                <span className="text-label-sm font-medium text-foreground truncate block">
                  @{agent}
                </span>
                <span className="text-[10px] text-muted">
                  {agentRuns.length} runs
                </span>
              </div>
            ))}
          </div>

          {/* Time axis + agent vertical tracks */}
          <div className="flex gap-2" style={{ height: "600px" }}>
            {/* Vertical time axis */}
            <div className="w-24 shrink-0 relative">
              {[0, 0.25, 0.5, 0.75, 1].map((p) => {
                const ts = timeRange.min + p * timeRange.range;
                const transform =
                  p === 1
                    ? "translateY(-100%)"
                    : p === 0
                      ? "translateY(0)"
                      : "translateY(-50%)";
                return (
                  <div
                    key={p}
                    className="absolute right-2 text-[10px] text-muted whitespace-nowrap"
                    style={{ top: `${p * 100}%`, transform }}
                  >
                    {formatDate(ts)} {formatTime(ts)}
                  </div>
                );
              })}
            </div>

            {/* Agent vertical tracks */}
            {agents.map(([agent, agentRuns]) => {
              const now = Date.now();
              // Pre-compute decorated rows once to avoid O(N²) Math.max inside
              // the render loop.
              const decorated: RunDecorated[] = agentRuns.map((run) => {
                const startedMs = toMs(run.started_at);
                const eff = effectiveEnd(run, now);
                return {
                  run,
                  startedMs,
                  endMs: eff.endMs,
                  result: eff.result,
                  duration: eff.endMs - startedMs,
                };
              });
              let longest = 0;
              for (const d of decorated) {
                if (d.duration > longest) longest = d.duration;
              }
              return (
                <div
                  key={agent}
                  data-testid={`timeline-swimlane-track-${agent}`}
                  className="w-24 shrink-0 relative bg-surface-high/50 rounded"
                >
                  {decorated.map(
                    ({ run, startedMs, endMs, result, duration }) => {
                      const top =
                        ((startedMs - timeRange.min) / timeRange.range) * 100;
                      const height = Math.max(
                        ((endMs - startedMs) / timeRange.range) * 100,
                        0.5,
                      );
                      const colorClass =
                        RESULT_COLORS[result] ?? "bg-muted/50";
                      const isHovered = hoveredRunId === run.id;
                      const isLongest = duration === longest;
                      return (
                        <button
                          type="button"
                          key={run.id}
                          data-testid={`timeline-swimlane-run-${run.id}`}
                          onClick={() => onSelectTask(run.task_id)}
                          onMouseEnter={() => setHoveredRunId(run.id)}
                          onMouseLeave={() => setHoveredRunId(null)}
                          className={cn(
                            "absolute left-1 right-1 rounded cursor-pointer transition-all",
                            colorClass,
                            isHovered && "ring-2 ring-primary z-10",
                            isLongest &&
                              !isHovered &&
                              "ring-1 ring-foreground/20",
                          )}
                          style={{
                            top: `${top}%`,
                            height: `${Math.min(height, 100 - top)}%`,
                          }}
                          title={`${run.taskTitle}\n@${run.agent} · ${formatDuration(
                            duration,
                          )} · ${result}`}
                        />
                      );
                    },
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-success/70 inline-block" />
          success
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-warning/70 inline-block" />
          running
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-danger/70 inline-block" />
          fail
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-muted/50 inline-block" />
          ended
        </span>
      </div>

      {/* Hovered run detail */}
      {hoveredRunId &&
        (() => {
          const run = runs.find((r) => r.id === hoveredRunId);
          if (!run) return null;
          const duration =
            effectiveEnd(run, Date.now()).endMs - toMs(run.started_at);
          return (
            <div
              data-testid="timeline-swimlane-hover-detail"
              className="mt-2 p-3 bg-surface border border-border rounded-lg text-body-sm"
            >
              <div className="flex items-center gap-2">
                {run.taskTicket && (
                  <span className="text-label-sm font-mono text-primary">
                    {run.taskTicket}
                  </span>
                )}
                <span className="font-medium text-foreground">
                  {run.taskTitle}
                </span>
                <span className="text-label-sm text-muted">@{run.agent}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-label-sm text-muted">
                <span>
                  {formatDate(run.started_at)} {formatTime(run.started_at)}
                </span>
                <span>→</span>
                <span>
                  {run.ended_at
                    ? `${formatDate(run.ended_at)} ${formatTime(run.ended_at)}`
                    : "running"}
                </span>
                <span>·</span>
                <span className="font-medium">{formatDuration(duration)}</span>
                {run.result && (
                  <span
                    className={cn(
                      run.result === "success" ? "text-success" : "text-muted",
                    )}
                  >
                    {run.result}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
