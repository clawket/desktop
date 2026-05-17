import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor: string;
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, htmlFor, required = false, children, ...rest },
  ref,
) {
  return (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn(
        "inline-flex items-center gap-1",
        "text-body-sm font-medium text-foreground",
        "select-none",
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {required && (
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      )}
      {required && <span className="sr-only">(required)</span>}
    </label>
  );
});
