import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { Input } from "../Input/Input";

/**
 * CommandSurface — Cmd+K palette.
 *
 * - Renders nothing when `open` is false (no portal needed at this level —
 *   the desktop shell can wrap it in a portal if it ever needs to escape).
 * - Owns: query state, active index, ArrowUp/Down/Enter/Escape handling.
 * - Doesn't own: result filtering (caller pre-filters), data fetching, key
 *   bindings (caller toggles `open`).
 *
 * Pure presentational + a thin keyboard reducer. Results follow the shape
 * { id, label, ticket?, hint?, kind? } so the same palette can drive
 * task / view / action navigation.
 */

export interface CommandItem {
  id: string;
  label: string;
  ticket?: string;
  hint?: ReactNode;
  /** Optional grouping label rendered above this item in the result list. */
  group?: string;
}

export interface CommandSurfaceProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  open: boolean;
  /** Result list. Caller pre-filters based on `query`. */
  items: CommandItem[];
  /** Controlled query string. */
  query: string;
  onQueryChange: (q: string) => void;
  /** Fires when a result is activated (click or Enter). */
  onSelect: (item: CommandItem) => void;
  /** Fires when Escape is pressed or the backdrop is clicked. */
  onClose: () => void;
  placeholder?: string;
  emptyMessage?: ReactNode;
}

export const CommandSurface = forwardRef<HTMLDivElement, CommandSurfaceProps>(
  function CommandSurface(
    {
      open,
      items,
      query,
      onQueryChange,
      onSelect,
      onClose,
      placeholder = "Type a command or search…",
      emptyMessage = "No matches",
      className,
      ...rest
    },
    ref,
  ) {
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listboxId = useId();

    useEffect(() => {
      if (open && items.length > 0 && activeIndex >= items.length) {
        setActiveIndex(0);
      }
    }, [open, items, activeIndex]);

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      if (open) {
        // Defer focus to the next tick so the dialog has time to mount.
        const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    }, [open]);

    const handleKey = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((i) =>
            items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
          );
          return;
        }
        if (event.key === "Enter") {
          const next = items[activeIndex];
          if (next) {
            event.preventDefault();
            onSelect(next);
          }
        }
      },
      [items, activeIndex, onClose, onSelect],
    );

    const grouped = useMemo(() => {
      const out: Array<{ group?: string; items: CommandItem[] }> = [];
      let lastGroup: string | undefined = undefined;
      let bucket: CommandItem[] = [];
      for (const item of items) {
        if (item.group !== lastGroup) {
          if (bucket.length > 0) out.push({ group: lastGroup, items: bucket });
          lastGroup = item.group;
          bucket = [];
        }
        bucket.push(item);
      }
      if (bucket.length > 0) out.push({ group: lastGroup, items: bucket });
      return out;
    }, [items]);

    if (!open) return null;

    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-slot="command-surface"
        onKeyDown={handleKey}
        className={cn(
          "fixed inset-0 z-50",
          "flex items-start justify-center",
          "pt-[10vh]",
          className,
        )}
        {...rest}
      >
        <button
          type="button"
          aria-label="Close command palette"
          onClick={onClose}
          className={cn(
            "absolute inset-0",
            "bg-background/60 backdrop-blur-sm",
            "cursor-default",
          )}
        />
        <div
          className={cn(
            "relative w-[36rem] max-w-[90vw]",
            "rounded-lg border border-border bg-surface shadow-elevated",
            "flex flex-col overflow-hidden",
          )}
        >
          <div className="border-b border-border p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              inputSize="md"
              aria-controls={listboxId}
              aria-activedescendant={
                items[activeIndex] ? `${listboxId}-${items[activeIndex].id}` : undefined
              }
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-[50vh] overflow-y-auto py-2"
          >
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-body-sm text-muted">
                {emptyMessage}
              </li>
            )}
            {grouped.map((bucket, gi) => (
              <li key={gi}>
                {bucket.group && (
                  <div className="px-4 pb-1 pt-2 text-label-sm uppercase tracking-wide text-muted">
                    {bucket.group}
                  </div>
                )}
                <ul>
                  {bucket.items.map((item) => {
                    const flatIndex = items.indexOf(item);
                    const isActive = flatIndex === activeIndex;
                    return (
                      <li
                        key={item.id}
                        id={`${listboxId}-${item.id}`}
                        role="option"
                        aria-selected={isActive}
                        data-command-id={item.id}
                        data-active={isActive || undefined}
                        onMouseMove={() => setActiveIndex(flatIndex)}
                        onClick={() => onSelect(item)}
                        className={cn(
                          "mx-1 flex cursor-pointer items-center gap-2",
                          "rounded-md px-3 py-2",
                          "text-body-sm text-foreground",
                          isActive && "bg-surface-high",
                        )}
                      >
                        {item.ticket && (
                          <span className="font-mono text-label-sm text-muted shrink-0">
                            {item.ticket}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="text-label-sm text-muted shrink-0">
                            {item.hint}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
);
