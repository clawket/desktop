import { useEffect, useState } from "react";
import { cn } from "@clawket/ui";
import type { UpdatePlanPatch } from "../data/api";
import type { Plan } from "../data/types";

export interface PlanEditModalProps {
  plan: Plan;
  onClose: () => void;
  onSubmit: (id: string, patch: UpdatePlanPatch) => Promise<void>;
}

/**
 * Build a minimum-diff PATCH. Empty description encodes the daemon's "clear"
 * semantics via `null` (three-state: omit / null / string).
 */
function buildPatch(
  initial: { title: string; description: string },
  draft: { title: string; description: string },
): UpdatePlanPatch {
  const patch: UpdatePlanPatch = {};
  if (draft.title !== initial.title) patch.title = draft.title;
  if (draft.description !== initial.description) {
    patch.description =
      draft.description.length > 0 ? draft.description : null;
  }
  return patch;
}

export function PlanEditModal({
  plan,
  onClose,
  onSubmit,
}: PlanEditModalProps) {
  const initial = {
    title: plan.title,
    description: plan.description ?? "",
  };
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
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
  const trimmedDescription = description.trim();
  const draft = { title: trimmedTitle, description: trimmedDescription };
  const patch = buildPatch(initial, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const canSubmit = trimmedTitle.length > 0 && hasChanges && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(plan.id, patch);
    } catch (e) {
      setErr((e as Error).message || "Failed to update plan");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit plan"
      data-testid="plan-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Edit plan
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="plan-edit-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p
            data-testid="plan-edit-id"
            className="font-mono text-label-sm text-subtle"
          >
            {plan.id}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Title <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="plan-edit-title"
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
              Description
            </span>
            <textarea
              data-testid="plan-edit-description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              data-testid="plan-edit-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="plan-edit-cancel"
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
            data-testid="plan-edit-submit"
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
