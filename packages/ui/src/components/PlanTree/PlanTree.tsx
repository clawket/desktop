import {
  forwardRef,
  useCallback,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { Badge, type BadgeProps } from "../Badge/Badge";
import { StatusPill, type TaskStatus } from "../StatusPill/StatusPill";

/**
 * PlanTree — recursive Plan → Unit → Task navigation.
 *
 * Data is shape-only — consumers pass the resolved hierarchy. The tree owns
 * collapse/expand state internally; the active selection is controlled.
 *
 * Each row exposes `data-node-id` and `data-node-kind` so the desktop shell
 * can map clicks back to daemon IDs without React refs.
 */

export type PlanTreeNodeKind = "plan" | "unit" | "task";
export type PlanStatus = "draft" | "active" | "completed";

export interface PlanTreeNode {
  id: string;
  kind: PlanTreeNodeKind;
  label: string;
  /** Optional ticket-style suffix shown on tasks (e.g. "LM-10876"). */
  ticket?: string;
  /** Task status surfaces as a StatusPill on task rows. */
  status?: TaskStatus;
  /** Plan status surfaces as a PlanStatusPill + accent bar on plan rows. */
  planStatus?: PlanStatus;
  /** done/total task counts — surfaces as a progress bar on unit (and plan) rows. */
  progress?: { done: number; total: number };
  /** Children — units inside plans, tasks inside units, sub-tasks inside tasks. */
  children?: PlanTreeNode[];
  /** Initial expanded state. */
  defaultExpanded?: boolean;
}

export interface PlanTreeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  nodes: PlanTreeNode[];
  /** Currently focused node id (controls highlight only). */
  activeId?: string;
  onSelect?: (node: PlanTreeNode) => void;
  /** Invoked when the inline "Approve" button is clicked on a draft plan row. */
  onApprovePlan?: (node: PlanTreeNode) => void;
}

const KIND_LABEL: Record<PlanTreeNodeKind, string> = {
  plan: "PLAN",
  unit: "UNIT",
  task: "TASK",
};

const KIND_BADGE_COLOR: Record<PlanTreeNodeKind, string> = {
  plan: "text-accent",
  unit: "text-primary",
  task: "text-muted",
};

const PLAN_STATUS_VARIANT: Record<PlanStatus, BadgeProps["variant"]> = {
  draft: "neutral",
  active: "info",
  completed: "success",
};

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "draft",
  active: "active",
  completed: "completed",
};

const PLAN_STATUS_ACCENT: Record<PlanStatus, string> = {
  draft: "border-l-2 border-l-border",
  active: "border-l-2 border-l-primary",
  completed: "border-l-2 border-l-success/40",
};

const PLAN_STATUS_ROW_TINT: Record<PlanStatus, string> = {
  draft: "",
  active: "",
  completed: "opacity-70",
};

export const PlanTree = forwardRef<HTMLDivElement, PlanTreeProps>(
  function PlanTree(
    { nodes, activeId, onSelect, onApprovePlan, className, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="tree"
        className={cn("flex flex-col gap-0.5 text-body-sm", className)}
        {...rest}
      >
        {nodes.map((node) => (
          <PlanTreeRow
            key={node.id}
            node={node}
            depth={0}
            activeId={activeId}
            onSelect={onSelect}
            onApprovePlan={onApprovePlan}
          />
        ))}
      </div>
    );
  },
);

interface PlanTreeRowProps {
  node: PlanTreeNode;
  depth: number;
  activeId?: string;
  onSelect?: (node: PlanTreeNode) => void;
  onApprovePlan?: (node: PlanTreeNode) => void;
}

function PlanTreeRow({
  node,
  depth,
  activeId,
  onSelect,
  onApprovePlan,
}: PlanTreeRowProps) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState<boolean>(
    node.defaultExpanded ?? depth === 0,
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onSelect?.(node);
    },
    [node, onSelect],
  );

  const toggle = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect?.(node);
      }
      if (event.key === "ArrowRight" && hasChildren && !expanded) {
        event.preventDefault();
        setExpanded(true);
      }
      if (event.key === "ArrowLeft" && hasChildren && expanded) {
        event.preventDefault();
        setExpanded(false);
      }
    },
    [expanded, hasChildren, node, onSelect],
  );

  const isActive = activeId === node.id;
  const planAccent =
    node.kind === "plan" && node.planStatus
      ? PLAN_STATUS_ACCENT[node.planStatus]
      : "";
  const planTint =
    node.kind === "plan" && node.planStatus
      ? PLAN_STATUS_ROW_TINT[node.planStatus]
      : "";

  const handleApprove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onApprovePlan?.(node);
    },
    [node, onApprovePlan],
  );

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        data-node-id={node.id}
        data-node-kind={node.kind}
        data-active={isActive || undefined}
        data-plan-status={
          node.kind === "plan" ? node.planStatus ?? undefined : undefined
        }
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKey}
        title={node.id}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={cn(
          "group flex items-center gap-1.5",
          "h-7 rounded-md pr-2",
          "cursor-pointer select-none",
          "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
          "hover:bg-surface-high",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isActive && "bg-surface-high",
          planAccent,
          planTint,
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={expanded ? "Collapse" : "Expand"}
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center",
              "text-muted hover:text-foreground",
            )}
          >
            <Chevron expanded={expanded} />
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}
        <span
          className={cn(
            "font-mono text-label-sm shrink-0",
            KIND_BADGE_COLOR[node.kind],
          )}
        >
          {KIND_LABEL[node.kind]}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body-sm text-foreground",
            node.kind === "plan" && "font-medium",
          )}
        >
          {node.label}
        </span>
        {node.ticket && (
          <span className="font-mono text-label-sm text-muted shrink-0">
            {node.ticket}
          </span>
        )}
        {node.kind === "plan" && node.planStatus && (
          <Badge
            variant={PLAN_STATUS_VARIANT[node.planStatus]}
            size="sm"
            dot
            data-status={node.planStatus}
            className="shrink-0"
          >
            {PLAN_STATUS_LABEL[node.planStatus]}
          </Badge>
        )}
        {node.kind === "plan" &&
          node.planStatus === "draft" &&
          onApprovePlan && (
            <button
              type="button"
              onClick={handleApprove}
              title="Approve plan (draft → active)"
              className={cn(
                "shrink-0 rounded-sm px-1.5 py-0.5",
                "text-label-sm font-medium text-primary",
                "bg-primary/10 hover:bg-primary/20",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              Approve
            </button>
          )}
        {node.kind === "unit" && node.progress && node.progress.total > 0 && (
          <ProgressMini
            done={node.progress.done}
            total={node.progress.total}
          />
        )}
        {node.status && (
          <StatusPill
            status={node.status}
            size="sm"
            hideDot
            className="shrink-0"
          />
        )}
      </div>
      {hasChildren && expanded && (
        <div role="group">
          {node.children!.map((child) => (
            <PlanTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onApprovePlan={onApprovePlan}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressMini({ done, total }: { done: number; total: number }): ReactNode {
  const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className="h-1.5 w-12 rounded-full bg-border overflow-hidden"
        aria-label={`Progress ${done} of ${total}`}
      >
        <div
          className="h-full bg-success transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-label-sm text-muted tabular-nums w-8 text-right">
        {done}/{total}
      </span>
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }): ReactNode {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: `rotate(${expanded ? 90 : 0}deg)`,
        transition: "transform var(--motion-fast) var(--motion-timing)",
      }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
