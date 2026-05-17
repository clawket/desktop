import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

export interface CollapsibleFiltersProps {
  /**
   * Stable identifier used to build the localStorage key
   * `clawket.filters.<viewId>.collapsed`. Pick something stable per surface
   * (e.g. "backlog", "timeline").
   */
  viewId: string;
  /** Section heading shown next to the toggle. Defaults to "Filters". */
  title?: string;
  /**
   * Optional badge (active filter count, etc.) rendered to the right of the
   * title. Hidden by passing `null`.
   */
  badge?: ReactNode;
  /**
   * Optional action slot rendered on the right edge of the header
   * (e.g. "Clear all", a visible-count). Always rendered — even when
   * collapsed — so the user retains access to clear/count without expanding.
   */
  actions?: ReactNode;
  /** Initial state when no stored preference exists. Defaults to false. */
  defaultCollapsed?: boolean;
  /**
   * Storage override for tests / SSR. `null` disables persistence entirely;
   * `undefined` (the default) falls back to `window.localStorage`.
   */
  storage?: Storage | null;
  /** Test-id for the root `<section>`. Defaults to "collapsible-filters". */
  testId?: string;
  /** Extra class names for the root `<section>`. */
  className?: string;
  /** Body content (the filter chips/inputs). */
  children: ReactNode;
}

function storageKey(viewId: string): string {
  return `clawket.filters.${viewId}.collapsed`;
}

function resolveStorage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored(
  storage: Storage | null,
  viewId: string,
  fallback: boolean,
): boolean {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(storageKey(viewId));
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function writeStored(
  storage: Storage | null,
  viewId: string,
  collapsed: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(viewId), collapsed ? "1" : "0");
  } catch {
    // Storage may be unavailable (private mode, quota); ignore.
  }
}

export function CollapsibleFilters({
  viewId,
  title = "Filters",
  badge,
  actions,
  defaultCollapsed = false,
  storage,
  testId = "collapsible-filters",
  className,
  children,
}: CollapsibleFiltersProps) {
  const resolvedStorage = useMemo(() => resolveStorage(storage), [storage]);
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readStored(resolvedStorage, viewId, defaultCollapsed),
  );

  // Re-read storage when viewId/storage changes so the component supports
  // dynamic identity swaps (e.g., when consumers reuse a single instance for
  // multiple surfaces — uncommon, but the contract should be predictable).
  // Skip the very first render: useState already seeded the correct value
  // and re-reading would cause a redundant render.
  const initialKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = `${viewId}|${resolvedStorage ? "1" : "0"}`;
    if (initialKeyRef.current === undefined) {
      initialKeyRef.current = key;
      return;
    }
    if (initialKeyRef.current === key) return;
    initialKeyRef.current = key;
    setCollapsed(readStored(resolvedStorage, viewId, defaultCollapsed));
  }, [resolvedStorage, viewId, defaultCollapsed]);

  useEffect(() => {
    writeStored(resolvedStorage, viewId, collapsed);
  }, [resolvedStorage, viewId, collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  const bodyId = `${testId}-body`;

  return (
    <section
      data-testid={testId}
      data-view-id={viewId}
      data-collapsed={collapsed || undefined}
      aria-label={title}
      className={cn(
        "shrink-0 border-b border-border bg-surface",
        "px-6 py-3",
        "flex flex-col gap-2",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`${testId}-toggle`}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={toggle}
          className={cn(
            "flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded",
            "text-label-sm uppercase tracking-wide text-muted",
            "hover:text-foreground hover:bg-surface-high",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <span aria-hidden className="font-mono text-[0.7rem]">
            {collapsed ? "▶" : "▼"}
          </span>
          <span>{title}</span>
        </button>
        {badge ? (
          <span data-testid={`${testId}-badge`} className="flex items-center">
            {badge}
          </span>
        ) : null}
        {actions ? (
          <span
            data-testid={`${testId}-actions`}
            className="ml-auto flex items-center gap-2"
          >
            {actions}
          </span>
        ) : null}
      </header>
      {!collapsed ? (
        <div
          id={bodyId}
          data-testid={`${testId}-body`}
          className="flex flex-col gap-2"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
