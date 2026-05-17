import { useEffect, useState } from "react";
import { cn } from "@clawket/ui";
import type { CreatePlanInput } from "../data/api";

export interface PlanCreateModalProps {
  /** Project to create the plan under. Required — the daemon rejects plan
   *  creation without a project_id. */
  projectId: string;
  onClose: () => void;
  onSubmit: (input: CreatePlanInput) => Promise<void>;
}

export function PlanCreateModal({
  projectId,
  onClose,
  onSubmit,
}: PlanCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"manual" | "plan-mode" | "import">(
    "manual",
  );
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
      const input: CreatePlanInput = {
        projectId,
        title: trimmedTitle,
        source,
      };
      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 0) input.description = trimmedDescription;
      await onSubmit(input);
    } catch (e) {
      setErr((e as Error).message || "Failed to create plan");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create plan"
      data-testid="plan-create-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Create plan
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="plan-create-close"
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
              data-testid="plan-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does this plan deliver?"
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
              data-testid="plan-create-description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, success criteria, references…"
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Source
            </span>
            <select
              data-testid="plan-create-source"
              value={source}
              onChange={(e) =>
                setSource(
                  e.target.value as "manual" | "plan-mode" | "import",
                )
              }
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground",
                "focus:border-primary focus:outline-none",
              )}
            >
              <option value="manual">Manual</option>
              <option value="plan-mode">Plan Mode</option>
              <option value="import">Import</option>
            </select>
          </label>
          {err && (
            <p
              role="alert"
              data-testid="plan-create-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="plan-create-cancel"
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
            data-testid="plan-create-submit"
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
