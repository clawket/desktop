import { cn } from "../lib/cn";

export interface HelloProps {
  name?: string;
  className?: string;
}

export function Hello({ name = "Clawket", className }: HelloProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 rounded-md font-display",
        "bg-surface text-foreground border border-border",
        className,
      )}
    >
      Hello, {name}.
    </div>
  );
}
