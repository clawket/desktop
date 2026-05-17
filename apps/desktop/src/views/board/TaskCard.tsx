import { useDraggable } from "@dnd-kit/core";
import { Badge, cn } from "@clawket/ui";
import type { Task, Tier } from "../../data/types";
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  STATUS_TRANSITIONS,
  normalizePriority,
} from "./constants";

/**
 * Tier badge — mirrors `web/src/components/board/TaskCard.tsx::TierBadge`.
 * Renders an arrow ("low→high") when `tier_used` diverges from the declared
 * `tier`, surfacing escalation events.
 */
const TIER_CLASS: Record<Tier, string> = {
  low: "bg-muted/15 text-muted",
  med: "bg-primary/15 text-primary",
  high: "bg-warning/15 text-warning",
};

function TierBadge({ task }: { task: Task }) {
  const declared = task.tier ?? null;
  const used = task.tier_used ?? null;
  if (!declared && !used) return null;
  const tier = (declared ?? used) as Tier;
  const cls = TIER_CLASS[tier] ?? "bg-surface-high text-muted";
  const escalated = declared && used && declared !== used;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]",
        cls,
      )}
      title={escalated ? `tier ${declared} → executed ${used}` : `tier ${tier}`}
    >
      {escalated ? `${declared}→${used}` : tier}
    </span>
  );
}

export interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onStatusChange: (newStatus: Task["status"]) => void;
}

/**
 * Stateless presentational card — must remain free of network calls and
 * local state so the `<DragOverlay>` portal can render it without lifecycle
 * asymmetry (see `web/.claude/rules/dnd-kit-overlay-state.md`).
 */
export function TaskCard({ task, onClick, onStatusChange }: TaskCardProps) {
  const transitions = STATUS_TRANSITIONS[task.status] ?? [];
  const priority = normalizePriority(task.priority);

  return (
    <div
      data-testid="board-task-card"
      className={cn(
        "w-full rounded-md border border-border bg-background text-left",
        "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
        "hover:border-primary/30 hover:bg-surface-high",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full space-y-2 rounded-t-md p-3 text-left",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
        )}
      >
        <div className="flex items-center gap-2">
          {task.ticket_number && (
            <span className="font-mono text-xs text-muted">
              {task.ticket_number}
            </span>
          )}
          <TierBadge task={task} />
        </div>
        <p className="text-sm font-medium leading-snug text-foreground">
          {task.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          {task.assignee ? (
            <Badge variant="info" size="sm">
              {task.assignee}
            </Badge>
          ) : (
            <span className="text-xs text-muted/50">Unassigned</span>
          )}
          <div
            className="flex items-center gap-1.5"
            title={PRIORITY_LABEL[priority]}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                PRIORITY_DOT[priority],
              )}
            />
            <span className="text-xs text-muted">
              {PRIORITY_LABEL[priority]}
            </span>
          </div>
        </div>
      </button>
      {transitions.length > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2 pt-0">
          {transitions.map((t) => (
            <button
              key={t.target}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(t.target);
              }}
              className={cn(
                "rounded border border-border px-2 py-0.5 text-xs text-muted",
                "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
                "hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Drag wrapper. `useDraggable` and `useDroppable` MUST live on different
 * components — combining them on one node makes the dnd-kit pointer sensor
 * release immediately (see `dnd-kit-overlay-state.md` §Rule body).
 */
export function DraggableTaskCard({
  task,
  onClick,
  onStatusChange,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      <TaskCard
        task={task}
        onClick={onClick}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}
