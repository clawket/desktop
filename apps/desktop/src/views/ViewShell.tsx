import { cn } from "@clawket/ui";
import type { ReactNode } from "react";

interface ViewShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}

export function ViewShell({
  title,
  subtitle,
  actions,
  children,
  testId,
}: ViewShellProps) {
  return (
    <div
      data-testid={testId}
      className={cn("flex h-full min-h-0 flex-col")}
    >
      <header
        className={cn(
          "shrink-0 border-b border-border",
          "px-6 py-4",
          "flex items-end justify-between gap-4",
        )}
      >
        <div className="min-w-0">
          <h1 className="text-headline-md font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-body-sm text-muted mt-1">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
