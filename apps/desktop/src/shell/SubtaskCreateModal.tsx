import { useEffect, useState } from "react";
import { cn } from "@clawket/ui";
import type { CreateSubtaskInput } from "../data/api";
import type { Task } from "../data/types";

export interface SubtaskCreateModalProps {
  /** Parent task — its unit/cycle is inherited unless overridden by the daemon. */
  parent: Task;
  onClose: () => void;
  onSubmit: (parentId: string, input: CreateSubtaskInput) => Promise<unknown>;
}

const PRIORITY_OPTIONS = ["low", "med", "high", "critical"] as const;

export function SubtaskCreateModal({
  parent,
  onClose,
  onSubmit,
}: SubtaskCreateModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<string>(parent.priority);
  const [assignee, setAssignee] = useState(parent.assignee ?? "");
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
  const trimmedBody = body.trim();
  const trimmedAssignee = assignee.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    const input: CreateSubtaskInput = { title: trimmedTitle };
    if (trimmedBody.length > 0) input.body = trimmedBody;
    if (priority !== parent.priority) input.priority = priority;
    if (trimmedAssignee.length > 0) input.assignee = trimmedAssignee;
    try {
      await onSubmit(parent.id, input);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to create subtask");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add subtask"
      data-testid="subtask-create-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Add subtask
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="subtask-create-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p
            data-testid="subtask-create-parent"
            className="font-mono text-label-sm text-subtle"
          >
            parent: {parent.ticket_number ?? parent.id}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Title <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="subtask-create-title"
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
              Body
            </span>
            <textarea
              data-testid="subtask-create-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Priority
              </span>
              <select
                data-testid="subtask-create-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground",
                  "focus:border-primary focus:outline-none",
                )}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Assignee
              </span>
              <input
                type="text"
                data-testid="subtask-create-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Inherits parent's assignee by default"
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground placeholder:text-muted",
                  "focus:border-primary focus:outline-none",
                )}
              />
            </label>
          </div>
          {err && (
            <p
              role="alert"
              data-testid="subtask-create-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="subtask-create-cancel"
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
            data-testid="subtask-create-submit"
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
