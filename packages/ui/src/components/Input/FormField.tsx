import {
  cloneElement,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { Label } from "./Label";
import { HelperText } from "./HelperText";

type ChildInputProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  invalid?: boolean;
  disabled?: boolean;
};

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Label text shown above the input. */
  label: ReactNode;
  /** Helper text shown below; styled as error when `error` is set. */
  helperText?: ReactNode;
  /** Error message — when set, overrides helperText and switches styling to error. */
  error?: ReactNode;
  /** Adds a visual required marker to the label. */
  required?: boolean;
  /** Disables the wrapped input by forwarding `disabled`. */
  disabled?: boolean;
  /** Overrides the auto-generated input id. */
  fieldId?: string;
  /**
   * The single input child. Must accept `id`, `aria-describedby`, `aria-invalid`,
   * and `invalid` props — i.e. an <Input> or compatible.
   */
  children: ReactElement<ChildInputProps>;
}

/**
 * FormField — Compound Pattern wrapper (ui-package.md §5).
 *
 *   <FormField label="Cycle name" error={errors.name}>
 *     <Input value={name} onChange={...} />
 *   </FormField>
 *
 * Wires `htmlFor` / `id`, `aria-describedby`, and `aria-invalid` so consumers
 * don't have to manage IDs by hand.
 */
export function FormField({
  className,
  label,
  helperText,
  error,
  required = false,
  disabled = false,
  fieldId,
  children,
  ...rest
}: FormFieldProps) {
  const reactId = useId();
  const inputId = fieldId ?? children.props.id ?? reactId;
  const helperId = `${inputId}-helper`;
  const hasError = error != null && error !== false;
  const helperMessage = hasError ? error : helperText;
  const showHelper = helperMessage != null && helperMessage !== false;

  let describedBy = children.props["aria-describedby"];
  if (showHelper) {
    describedBy = describedBy ? `${describedBy} ${helperId}` : helperId;
  }

  const childWithProps = isValidElement(children)
    ? cloneElement(children, {
        id: inputId,
        "aria-describedby": describedBy,
        "aria-invalid": hasError ? true : children.props["aria-invalid"],
        invalid: hasError ? true : children.props.invalid,
        disabled: disabled || children.props.disabled,
      } as ChildInputProps)
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...rest}>
      <Label htmlFor={inputId} required={required}>
        {label}
      </Label>
      {childWithProps}
      {showHelper && (
        <HelperText id={helperId} variant={hasError ? "error" : "default"}>
          {helperMessage}
        </HelperText>
      )}
    </div>
  );
}
