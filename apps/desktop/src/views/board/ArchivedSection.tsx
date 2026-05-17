import { useState } from "react";
import { cn } from "@clawket/ui";
import type { Task, TaskStatus } from "../../data/types";

const ARCHIVED_STATUSES: TaskStatus[] = ["cancelled"];

const ARCHIVED_STATUS_ICON: Record<string, { icon: string; label: string }> = {
  cancelled: { icon: "✕", label: "Cancelled" },
};

/**
 * Collapsible footer that holds tasks excluded from the live Kanban grid
 * (`cancelled`). Mirrors `web/src/components/board/ArchivedSection.tsx`
 * so the operator sees the same affordance in both surfaces.
 */
export function ArchivedSection({
  tasksByStatus,
  onSelectTask,
}: {
  tasksByStatus: Record<TaskStatus, Task[]>;
  onSelectTask: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const archivedTasks = ARCHIVED_STATUSES.flatMap((s) => tasksByStatus[s]);

  if (archivedTasks.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border pt-2">
      <button
        type="button"
        data-testid="board-archived-toggle"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex cursor-pointer items-center gap-2 px-1 py-1 text-sm text-muted",
          "transition-colors hover:text-foreground",
        )}
      >
        <span className="text-xs">{open ? "▼" : "▶"}</span>
        <span>Archived</span>
        <span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-xs text-muted">
          {archivedTasks.length}
        </span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3">
          {ARCHIVED_STATUSES.map((status) => {
            const items = tasksByStatus[status];
            if (items.length === 0) return null;
            const info = ARCHIVED_STATUS_ICON[status];
            return (
              <div key={status} className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-xs text-muted">{info.icon}</span>
                  <span className="text-xs font-medium text-muted">
                    {info.label}
                  </span>
                  <span className="text-xs text-muted">({items.length})</span>
                </div>
                {items.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    data-testid="board-archived-task"
                    onClick={() => onSelectTask(task.id)}
                    className={cn(
                      "w-full rounded-md border border-border bg-background/50 p-2 text-left opacity-60",
                      "transition-colors hover:bg-surface-high hover:opacity-100",
                    )}
                  >
                    {task.ticket_number && (
                      <span className="block font-mono text-[10px] text-muted">
                        {task.ticket_number}
                      </span>
                    )}
                    <p className="text-xs text-muted line-through">
                      {task.title}
                    </p>
                    {task.assignee && (
                      <span className="mt-1 inline-block text-[10px] text-muted">
                        @{task.assignee}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
