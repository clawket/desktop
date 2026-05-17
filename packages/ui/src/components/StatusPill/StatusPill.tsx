import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../Badge/Badge";

/**
 * Clawket task status enum (mirrors daemon TaskStatus).
 *
 * Keep this list exhaustive — TypeScript will refuse to compile if a status
 * goes unmapped in the lookup table below, ensuring new statuses surface
 * here first.
 */
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

type StatusConfig = {
  variant: BadgeProps["variant"];
  label: string;
  strikethrough?: boolean;
};

const STATUS_MAP: Record<TaskStatus, StatusConfig> = {
  todo: { variant: "neutral", label: "todo" },
  in_progress: { variant: "info", label: "in_progress" },
  blocked: { variant: "warning", label: "blocked" },
  done: { variant: "success", label: "done" },
  cancelled: { variant: "neutral", label: "cancelled", strikethrough: true },
};

export interface StatusPillProps
  extends Omit<BadgeProps, "variant" | "children" | "dot"> {
  status: TaskStatus;
  /** Override the rendered label; defaults to the status string. */
  label?: string;
  /** Hide the leading status dot (default: visible). */
  hideDot?: boolean;
}

export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(
  function StatusPill(
    { status, label, hideDot = false, className, ...rest },
    ref,
  ) {
    const config = STATUS_MAP[status];
    const text = label ?? config.label;

    return (
      <Badge
        ref={ref}
        variant={config.variant}
        dot={!hideDot}
        data-status={status}
        className={[
          config.strikethrough ? "line-through opacity-70" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {text}
      </Badge>
    );
  },
);
