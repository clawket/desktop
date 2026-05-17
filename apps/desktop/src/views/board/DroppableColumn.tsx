import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@clawket/ui";
import type { BoardColumn } from "./constants";

/**
 * Kanban column with a droppable surface. Droppable id is the task status
 * enum value — drop handlers in BoardView map directly back to `status`.
 */
export function DroppableColumn({
  col,
  count,
  children,
}: {
  col: BoardColumn;
  count: number;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      data-testid="board-column"
      data-status={col.key}
      aria-label={`${col.key} column`}
      className={cn(
        "flex min-h-0 flex-col rounded-lg border-2 bg-surface/50",
        "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
        isOver ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between rounded-t-lg px-3 py-2.5",
          col.headerBg,
        )}
      >
        <span className={cn("text-sm font-semibold", col.headerText)}>
          {col.label}
        </span>
        <span
          data-testid="board-column-count"
          className={cn(
            "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium",
            col.countBg,
            col.countText,
          )}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}
