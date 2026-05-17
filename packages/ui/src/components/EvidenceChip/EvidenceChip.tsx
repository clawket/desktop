import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../Badge/Badge";

/**
 * EvidenceChip — surfaces whether a task carries evidence.
 *
 * Daemon enforces EVIDENCE_REQUIRED (4 KiB cap) when a task transitions to
 * `done`. The chip lets the UI tell at a glance whether that requirement is
 * satisfied without opening the task detail.
 */
export interface EvidenceChipProps
  extends Omit<BadgeProps, "variant" | "children" | "dot"> {
  hasEvidence: boolean;
  /** Override the rendered text. */
  label?: string;
}

const CheckIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const MissingIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export const EvidenceChip = forwardRef<HTMLSpanElement, EvidenceChipProps>(
  function EvidenceChip(
    { hasEvidence, label, title, className, ...rest },
    ref,
  ) {
    const text = label ?? (hasEvidence ? "evidence" : "no evidence");
    const tooltip =
      title ??
      (hasEvidence
        ? "Evidence attached. 4 KiB cap enforced by daemon."
        : "Evidence required to transition this task to done (4 KiB cap).");

    return (
      <Badge
        ref={ref}
        variant={hasEvidence ? "success" : "danger"}
        data-evidence={hasEvidence ? "present" : "missing"}
        title={tooltip}
        className={className}
        {...rest}
      >
        <span className="inline-flex items-center gap-1">
          {hasEvidence ? <CheckIcon /> : <MissingIcon />}
          <span>{text}</span>
        </span>
      </Badge>
    );
  },
);
