import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

export const helperTextVariants = cva("text-label-sm", {
  variants: {
    variant: {
      default: "text-muted",
      error: "text-danger",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface HelperTextProps
  extends HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof helperTextVariants> {
  id: string;
}

export const HelperText = forwardRef<HTMLParagraphElement, HelperTextProps>(
  function HelperText({ className, variant, id, children, ...rest }, ref) {
    return (
      <p
        ref={ref}
        id={id}
        role={variant === "error" ? "alert" : undefined}
        className={cn(helperTextVariants({ variant }), className)}
        {...rest}
      >
        {children}
      </p>
    );
  },
);
