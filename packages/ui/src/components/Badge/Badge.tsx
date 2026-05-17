import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * Badge — small status / count chip.
 *
 * Styling Chain (ui-package.md §3):
 *   palette token → semantic CSS var → CVA variant → Tailwind utility → element.
 *
 * For domain-specific statuses (task status, tier, evidence), build a thin
 * wrapper on top of Badge instead of widening this base variant set.
 */
export const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "font-display font-medium tracking-tight",
    "border border-transparent",
    "whitespace-nowrap select-none",
    "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-surface-high text-foreground border-border",
        success: "bg-success/15 text-success border-success/30",
        warning: "bg-warning/15 text-warning border-warning/30",
        danger: "bg-danger/15 text-danger border-danger/30",
        info: "bg-primary/15 text-primary border-primary/30",
        accent: "bg-accent/15 text-accent border-accent/30",
      },
      size: {
        sm: "h-5 px-2 text-label-sm rounded-sm",
        md: "h-6 px-2.5 text-body-sm rounded-md",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  },
);

const dotVariants = cva("inline-block rounded-full", {
  variants: {
    variant: {
      neutral: "bg-muted",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
      info: "bg-primary",
      accent: "bg-accent",
    },
    size: {
      sm: "h-1.5 w-1.5",
      md: "h-2 w-2",
    },
  },
  defaultVariants: {
    variant: "neutral",
    size: "sm",
  },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Renders a small leading color dot. */
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, size, dot = false, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...rest}
    >
      {dot && (
        <span aria-hidden="true" className={dotVariants({ variant, size })} />
      )}
      <span>{children}</span>
    </span>
  );
});
