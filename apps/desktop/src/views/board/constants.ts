import type { TaskStatus } from "../../data/types";

/**
 * Kanban column registry — mirrors `clawket/web/src/components/board/constants.ts`.
 * `cancelled` is intentionally excluded; cancelled tasks live in the
 * collapsible `ArchivedSection` below the board.
 *
 * Color classes are semantic-only — Tailwind v4 resolves the `/10`, `/20`
 * opacity modifiers from `--color-*` tokens, so dark/light theme switching
 * stays automatic.
 */
export interface BoardColumn {
  key: Exclude<TaskStatus, "cancelled">;
  label: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  countText: string;
}

export const COLUMNS: BoardColumn[] = [
  {
    key: "todo",
    label: "Todo",
    headerBg: "bg-muted/10",
    headerText: "text-muted",
    countBg: "bg-muted/20",
    countText: "text-muted",
  },
  {
    key: "in_progress",
    label: "In Progress",
    headerBg: "bg-warning/10",
    headerText: "text-warning",
    countBg: "bg-warning/20",
    countText: "text-warning",
  },
  {
    key: "blocked",
    label: "Blocked",
    headerBg: "bg-danger/10",
    headerText: "text-danger",
    countBg: "bg-danger/20",
    countText: "text-danger",
  },
  {
    key: "done",
    label: "Done",
    headerBg: "bg-success/10",
    headerText: "text-success",
    countBg: "bg-success/20",
    countText: "text-success",
  },
];

/**
 * Priority palette. Tasks emitted by the daemon carry `priority: string`,
 * so callers must default to "low" / treat unknown values as muted.
 */
export type Priority = "critical" | "high" | "medium" | "low";

export const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-primary",
  low: "bg-muted",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function normalizePriority(raw: string): Priority {
  return raw === "critical" || raw === "high" || raw === "medium" || raw === "low"
    ? raw
    : "low";
}

/**
 * Inline status transition shortcuts rendered as buttons beneath the card.
 * The `cancelled` state is reachable only via the detail drawer (delete →
 * soft-cancel) — exposing a button here would conflict with the daemon's
 * EVIDENCE_REQUIRED gate on `done`.
 */
export const STATUS_TRANSITIONS: Record<
  TaskStatus,
  { label: string; target: TaskStatus }[]
> = {
  todo: [{ label: "Start →", target: "in_progress" }],
  in_progress: [
    { label: "← Todo", target: "todo" },
    { label: "Done →", target: "done" },
  ],
  done: [{ label: "← Reopen", target: "in_progress" }],
  blocked: [{ label: "Unblock →", target: "todo" }],
  cancelled: [{ label: "← Reopen", target: "todo" }],
};
