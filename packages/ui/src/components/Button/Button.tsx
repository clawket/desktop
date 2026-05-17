import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * Button — base interactive primitive.
 *
 * Styling Chain (ui-package.md §3):
 *   palette/semantic tokens → CVA variant → Tailwind utility → element class.
 *
 * All variants resolve to semantic colour tokens so dark/light switch via
 * `data-theme` works without per-variant overrides.
 */
export const buttonVariants = cva(
  // base — applied to every variant
  [
    "inline-flex items-center justify-center gap-2 select-none",
    "font-display font-medium tracking-tight whitespace-nowrap",
    "border border-transparent",
    "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-surface-high text-foreground border-border hover:bg-[color-mix(in_srgb,var(--color-surface-high)_85%,white)]",
        primary:
          "bg-primary text-background hover:bg-primary-hover",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-high",
        outline:
          "bg-transparent text-foreground border-border hover:bg-surface-high",
        danger:
          "bg-danger text-foreground hover:bg-[color-mix(in_srgb,var(--color-danger)_85%,white)]",
      },
      size: {
        sm: "h-7 px-2.5 text-body-sm rounded-md",
        md: "h-9 px-4 text-body-base rounded-md",
        lg: "h-11 px-6 text-body-lg rounded-lg",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "ghost",
        className: "border-transparent",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "md",
      fullWidth: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    loading = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? (
        <Spinner aria-hidden="true" />
      ) : (
        leadingIcon && <span aria-hidden="true">{leadingIcon}</span>
      )}
      <span>{children}</span>
      {!loading && trailingIcon && <span aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
});

function Spinner({ ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      {...rest}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
