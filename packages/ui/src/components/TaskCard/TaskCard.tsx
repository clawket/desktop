import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { StatusPill, type TaskStatus } from "../StatusPill/StatusPill";
import { TierMark, type Tier } from "../TierMark/TierMark";
import { EvidenceChip } from "../EvidenceChip/EvidenceChip";
import { AgentTag } from "../AgentTag/AgentTag";

/**
 * TaskCard — compact summary surface for a Clawket task.
 *
 * Composes the domain primitives (StatusPill / TierMark / EvidenceChip /
 * AgentTag) on top of a single hoverable / selectable container. Pure
 * presentational — the parent owns activation state and emits clicks.
 */
export interface TaskCardProps extends HTMLAttributes<HTMLDivElement> {
  ticket: string;
  title: string;
  status: TaskStatus;
  tier?: Tier;
  agent?: string;
  hasEvidence?: boolean;
  /** Highlights the card as currently selected. */
  selected?: boolean;
  /** Disables hover/cursor affordances when this card isn't interactive. */
  inactive?: boolean;
}

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(
  function TaskCard(
    {
      ticket,
      title,
      status,
      tier,
      agent,
      hasEvidence,
      selected = false,
      inactive = false,
      className,
      onClick,
      ...rest
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role={inactive ? undefined : "button"}
        tabIndex={inactive ? undefined : 0}
        data-task-card={ticket}
        data-selected={selected || undefined}
        onClick={onClick}
        className={cn(
          "group flex flex-col gap-2",
          "rounded-md border border-border bg-surface px-3 py-2.5",
          "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
          !inactive &&
            "cursor-pointer hover:border-primary/40 hover:bg-surface-high",
          !inactive &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          selected && "border-primary bg-surface-high",
          className,
        )}
        {...rest}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-label-sm text-muted shrink-0">
            {ticket}
          </span>
          <span className="min-w-0 flex-1 truncate text-body-base text-foreground">
            {title}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={status} size="sm" />
          {tier && <TierMark tier={tier} size="sm" />}
          {agent && <AgentTag agent={agent} size="sm" />}
          {hasEvidence !== undefined && (
            <EvidenceChip hasEvidence={hasEvidence} size="sm" />
          )}
        </div>
      </div>
    );
  },
);
