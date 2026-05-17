import { useEffect, useState } from "react";
import { cn } from "@clawket/ui";
import type { UpdateCyclePatch } from "../data/api";
import type { Cycle } from "../data/types";

export interface CycleEditModalProps {
  cycle: Cycle;
  onClose: () => void;
  onSubmit: (id: string, patch: UpdateCyclePatch) => Promise<void>;
}

/**
 * Minimum-diff PATCH. Empty goal encodes the daemon's clear semantics via
 * `null` (three-state: omit / null / string). `status` is mutated via
 * dedicated endpoints (activate / complete) so this modal does not expose it.
 */
function buildPatch(
  initial: { title: string; goal: string },
  draft: { title: string; goal: string },
): UpdateCyclePatch {
  const patch: UpdateCyclePatch = {};
  if (draft.title !== initial.title) patch.title = draft.title;
  if (draft.goal !== initial.goal) {
    patch.goal = draft.goal.length > 0 ? draft.goal : null;
  }
  return patch;
}

export function CycleEditModal({
  cycle,
  onClose,
  onSubmit,
}: CycleEditModalProps) {
  const initial = {
    title: cycle.title,
    goal: cycle.goal ?? "",
  };
  const [title, setTitle] = useState(initial.title);
  const [goal, setGoal] = useState(initial.goal);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmedTitle = title.trim();
  const trimmedGoal = goal.trim();
  const draft = { title: trimmedTitle, goal: trimmedGoal };
  const patch = buildPatch(initial, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const canSubmit = trimmedTitle.length > 0 && hasChanges && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(cycle.id, patch);
    } catch (e) {
      setErr((e as Error).message || "Failed to update cycle");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit cycle"
      data-testid="cycle-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Edit cycle
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="cycle-edit-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p
            data-testid="cycle-edit-id"
            className="font-mono text-label-sm text-subtle"
          >
            {cycle.id}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Title <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="cycle-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              data-testid="cycle-edit-goal"
              rows={6}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
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
              data-testid="cycle-edit-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="cycle-edit-cancel"
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
            data-testid="cycle-edit-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5",
              "text-body-sm font-semibold text-primary-foreground",
              "hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
