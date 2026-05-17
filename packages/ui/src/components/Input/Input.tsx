import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * Input — text-entry primitive.
 *
 * Styling Chain (ui-package.md §3):
 *   palette token → semantic CSS var → CVA variant → Tailwind utility → element.
 *
 * Designed to be composed inside <FormField> for label + helper text + a11y
 * wiring, but works standalone for bare cases.
 */
export const inputVariants = cva(
  [
    "block w-full appearance-none",
    "bg-surface text-foreground placeholder:text-muted",
    "border border-border",
    "font-sans",
    "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-timing)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "read-only:opacity-80 read-only:cursor-default",
  ],
  {
    variants: {
      variant: {
        default: "border-border focus-visible:border-primary",
        error:
          "border-danger focus-visible:ring-danger focus-visible:border-danger",
      },
      inputSize: {
        md: "h-9 px-3 text-body-base rounded-md",
        lg: "h-11 px-4 text-body-lg rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "md",
    },
  },
);

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size">;

export interface InputProps
  extends NativeInputProps,
    VariantProps<typeof inputVariants> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Marks the input invalid; flips variant to "error" and sets aria-invalid. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    variant,
    inputSize,
    leadingIcon,
    trailingIcon,
    invalid = false,
    disabled,
    id,
    type = "text",
    "aria-invalid": ariaInvalidProp,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const effectiveVariant = invalid ? "error" : variant;
  const ariaInvalid = ariaInvalidProp ?? (invalid || undefined);

  if (!leadingIcon && !trailingIcon) {
    return (
      <input
        ref={ref}
        id={inputId}
        type={type}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          inputVariants({ variant: effectiveVariant, inputSize }),
          className,
        )}
        {...rest}
      />
    );
  }

  return (
    <div className="relative inline-flex w-full items-center">
      {leadingIcon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 inline-flex items-center text-muted"
        >
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          inputVariants({ variant: effectiveVariant, inputSize }),
          leadingIcon && "pl-9",
          trailingIcon && "pr-9",
          className,
        )}
        {...rest}
      />
      {trailingIcon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 inline-flex items-center text-muted"
        >
          {trailingIcon}
        </span>
      )}
    </div>
  );
});
