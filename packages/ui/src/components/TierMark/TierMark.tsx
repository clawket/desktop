import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../Badge/Badge";

/**
 * Clawket tier enum (mirrors daemon Tier).
 *
 * v3 = advisory (warning), v4 = hard-enforced. Surface the tier consistently
 * so reviewers can spot mis-tiered tasks at a glance.
 */
export type Tier = "low" | "med" | "high";

type TierConfig = {
  variant: BadgeProps["variant"];
  label: string;
};

const TIER_MAP: Record<Tier, TierConfig> = {
  low: { variant: "neutral", label: "low" },
  med: { variant: "accent", label: "med" },
  high: { variant: "danger", label: "high" },
};

export interface TierMarkProps
  extends Omit<BadgeProps, "variant" | "children" | "dot"> {
  tier: Tier;
  /** Include the "tier:" prefix in the rendered label. Defaults to true. */
  showPrefix?: boolean;
}

export const TierMark = forwardRef<HTMLSpanElement, TierMarkProps>(
  function TierMark({ tier, showPrefix = true, className, ...rest }, ref) {
    const config = TIER_MAP[tier];
    const text = showPrefix ? `tier:${config.label}` : config.label;

    return (
      <Badge
        ref={ref}
        variant={config.variant}
        data-tier={tier}
        className={className}
        {...rest}
      >
        {text}
      </Badge>
    );
  },
);
