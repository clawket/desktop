import { forwardRef } from "react";
import { Badge, type BadgeProps } from "../Badge/Badge";

/**
 * AgentTag — deterministically colours an agent identifier.
 *
 * "main" always gets the neutral palette so the orchestrator is visually
 * distinct. Sub-agent labels hash into a fixed 4-colour pool so the same
 * agent gets the same colour across views and sessions.
 */
type AgentVariant = NonNullable<BadgeProps["variant"]>;

const SUBAGENT_PALETTE: AgentVariant[] = ["info", "accent", "success", "warning"];

export interface AgentTagProps
  extends Omit<BadgeProps, "variant" | "children" | "dot"> {
  agent: string;
  /** Override the deterministic colour assignment. */
  variant?: AgentVariant;
  /** Hide the leading agent dot (default: visible). */
  hideDot?: boolean;
}

/**
 * 32-bit FNV-1a hash. Deterministic across runs without pulling in a crypto
 * dependency — collisions across 4 buckets are fine for purely visual
 * differentiation.
 */
function hashAgent(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function resolveAgentVariant(agent: string): AgentVariant {
  if (agent === "main") return "neutral";
  return SUBAGENT_PALETTE[hashAgent(agent) % SUBAGENT_PALETTE.length]!;
}

export const AgentTag = forwardRef<HTMLSpanElement, AgentTagProps>(
  function AgentTag(
    { agent, variant, hideDot = false, className, ...rest },
    ref,
  ) {
    const resolved = variant ?? resolveAgentVariant(agent);

    return (
      <Badge
        ref={ref}
        variant={resolved}
        dot={!hideDot}
        data-agent={agent}
        className={className}
        {...rest}
      >
        {agent}
      </Badge>
    );
  },
);
