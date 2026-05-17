// Activity-stream sub-view of TimelineView.
//
// Mirrors the web dashboard's activity stream (clawket/web/src/components/
// TimelineView.tsx, Activity tab). Renders the daemon's
// `/projects/:id/timeline` payload as a day-grouped feed with per-event
// icons, descriptions, and time stamps.
//
// Wire fact: the daemon's timeline `event_type` field is **not** the SSE
// colon-syntax (`task:created`). It comes from
// `daemon/src/repo/timeline.rs` and is one of:
//   status_change, assignment, comment, knowledge, run_start, run_end,
//   question, created, updated.
// EVENT_CONFIG below is keyed off that exact set; unknown event_types fall
// back to the `updated` config so we never break on a daemon-side addition.
//
// We surface a click-through to the task drawer when the event's
// `entity_type === "task"`; other entity types render but are not navigable
// (matches web behaviour).

import { useMemo } from "react";
import { cn } from "@clawket/ui";
import type { TimelineEvent } from "../../data/types";
import { formatDate, formatDuration, formatTime } from "./format";

type EventConfig = { icon: string; color: string; dotColor: string };

const EVENT_CONFIG: Record<string, EventConfig> = {
  status_change: {
    icon: "●",
    color: "text-primary",
    dotColor: "bg-primary",
  },
  assignment: {
    icon: "→",
    color: "text-foreground",
    dotColor: "bg-foreground",
  },
  comment: { icon: "◇", color: "text-foreground", dotColor: "bg-muted" },
  knowledge: { icon: "□", color: "text-foreground", dotColor: "bg-accent" },
  run_start: { icon: "▶", color: "text-warning", dotColor: "bg-warning" },
  run_end: { icon: "■", color: "text-success", dotColor: "bg-success" },
  question: { icon: "◇", color: "text-warning", dotColor: "bg-warning" },
  created: { icon: "+", color: "text-success", dotColor: "bg-success" },
  updated: { icon: "~", color: "text-foreground", dotColor: "bg-muted" },
};

const FALLBACK_CONFIG: EventConfig = EVENT_CONFIG.updated!;

interface EventDescription {
  action: string;
  target: string;
  detail?: string;
}

type EventDetail = {
  old_value?: string;
  new_value?: string;
  body?: string;
  artifact_type?: string;
  result?: string;
  duration_ms?: number;
  field?: string;
};

function describeEvent(ev: TimelineEvent): EventDescription {
  const title = ev.entity_title || ev.entity_id || "(no title)";
  const actor = ev.actor ? `@${ev.actor}` : "System";
  const d = (ev.detail ?? {}) as EventDetail;
  switch (ev.event_type) {
    case "status_change":
      return {
        action: `${actor} changed status`,
        target: title,
        detail: `${d.old_value ?? "?"} → ${d.new_value ?? "?"}`,
      };
    case "assignment":
      return {
        action: d.new_value
          ? `Assigned to @${d.new_value}`
          : `${actor} unassigned`,
        target: title,
      };
    case "comment":
      return {
        action: `${actor} commented`,
        target: title,
        detail: d.body?.slice(0, 80),
      };
    case "knowledge":
      return {
        action: `${d.artifact_type ?? "Knowledge"} added`,
        target: title,
      };
    case "run_start":
      return { action: `${actor} started`, target: title };
    case "run_end":
      return {
        action: `${actor} finished`,
        target: title,
        detail: [
          d.result,
          d.duration_ms != null ? formatDuration(d.duration_ms) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "question":
      return {
        action: `${actor} asked`,
        target: title,
        detail: d.body?.slice(0, 80),
      };
    case "created":
      return { action: `${actor} created`, target: title };
    case "updated":
      return {
        action: `${actor} updated ${d.field ?? ""}`.trimEnd(),
        target: title,
        detail: d.field
          ? `${d.old_value ?? "?"} → ${d.new_value ?? "?"}`
          : undefined,
      };
    default:
      return { action: actor, target: title };
  }
}

export interface ActivityStreamProps {
  events: TimelineEvent[];
  onSelectTask: (taskId: string) => void;
}

export function ActivityStream({ events, onSelectTask }: ActivityStreamProps) {
  const dayGroups = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const key = formatDate(ev.created_at);
      const arr = groups.get(key) ?? [];
      arr.push(ev);
      groups.set(key, arr);
    }
    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div
        data-testid="timeline-activity-empty"
        className="text-center py-12 text-body-sm text-muted"
      >
        No activity yet.
      </div>
    );
  }

  return (
    <div data-testid="timeline-activity" className="relative">
      {/* Vertical guide line that runs through the day-marker dots. */}
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
      {Array.from(dayGroups.entries()).map(([day, dayEvents]) => (
        <section
          key={day}
          data-testid="timeline-activity-day"
          data-day={day}
          className="mb-4"
        >
          <header className="flex items-center gap-2 mb-2 relative">
            <div className="w-[23px] h-[23px] rounded-full bg-surface-high border border-border flex items-center justify-center z-10">
              <span className="text-[9px] text-muted font-medium">
                {day === "Today" ? "T" : day === "Yesterday" ? "Y" : day}
              </span>
            </div>
            <span className="text-label-sm font-medium text-muted">{day}</span>
            <span className="text-[10px] text-muted">({dayEvents.length})</span>
          </header>
          <ol className="space-y-0.5">
            {dayEvents.map((ev) => {
              const config = EVENT_CONFIG[ev.event_type] ?? FALLBACK_CONFIG;
              const desc = describeEvent(ev);
              const isTaskNavigable =
                ev.entity_type === "task" && ev.entity_id !== null;
              return (
                <li
                  key={ev.id}
                  data-testid="timeline-activity-event"
                  data-kind={ev.event_type}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isTaskNavigable && ev.entity_id) {
                        onSelectTask(ev.entity_id);
                      }
                    }}
                    disabled={!isTaskNavigable}
                    className={cn(
                      "w-full text-left flex items-start gap-2.5 pl-1 pr-3 py-1.5",
                      "rounded-md transition-colors",
                      isTaskNavigable
                        ? "hover:bg-surface-high cursor-pointer"
                        : "cursor-default",
                    )}
                  >
                    <div className="w-[23px] flex items-center justify-center shrink-0 pt-0.5 relative z-10">
                      <span
                        aria-hidden
                        className={cn(
                          "w-2 h-2 rounded-full",
                          config.dotColor,
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-label-sm", config.color)}>
                          {config.icon}
                        </span>
                        <span className="text-label-sm text-muted">
                          {desc.action}
                        </span>
                        <span className="text-body-sm text-foreground truncate">
                          {desc.target}
                        </span>
                      </div>
                      {desc.detail && (
                        <p className="text-label-sm text-muted truncate mt-0.5">
                          {desc.detail}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <span className="text-[10px] text-muted">
                        {formatTime(ev.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
