import { useEffect, useState } from "react";
import { cn } from "@clawket/ui";
import type { CreateUnitInput } from "../data/api";

export interface UnitCreateModalProps {
  /** Plan to create the unit under. Required by the daemon. */
  planId: string;
  onClose: () => void;
  onSubmit: (input: CreateUnitInput) => Promise<void>;
}

export function UnitCreateModal({
  planId,
  onClose,
  onSubmit,
}: UnitCreateModalProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const input: CreateUnitInput = {
        planId,
        title: trimmedTitle,
      };
      const trimmedGoal = goal.trim();
      if (trimmedGoal.length > 0) input.goal = trimmedGoal;
      await onSubmit(input);
    } catch (e) {
      setErr((e as Error).message || "Failed to create unit");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create unit"
      data-testid="unit-create-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Create unit
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="unit-create-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Title <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="unit-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does this unit group?"
              autoFocus
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Goal
            </span>
            <textarea
              data-testid="unit-create-goal"
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Outcome this unit must produce…"
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          {err && (
            <p
              role="alert"
              data-testid="unit-create-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="unit-create-cancel"
            onClick={onClose}
            className={cn(
              "rounded-md px-3 py-1.5 text-body-sm text-foreground",
              "hover:bg-surface-high focus:outline-none",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="unit-create-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5",
              "text-body-sm font-semibold text-primary-foreground",
              "hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </footer>
      </div>
    </div>
  );
}
