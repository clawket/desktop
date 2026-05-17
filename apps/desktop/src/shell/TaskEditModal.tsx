import { useEffect, useState } from "react";
import { cn, type Tier } from "@clawket/ui";
import type { UpdateTaskPatch } from "../data/api";
import type { Task } from "../data/types";

export interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
  onSubmit: (id: string, patch: UpdateTaskPatch) => Promise<unknown>;
}

const TIER_OPTIONS: Tier[] = ["low", "med", "high"];
const PRIORITY_OPTIONS = ["low", "med", "high", "critical"] as const;

interface DraftState {
  title: string;
  body: string;
  priority: string;
  assignee: string;
  tier: Tier;
  labelsCsv: string;
}

function normalizeLabels(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildPatch(
  initial: DraftState,
  initialLabels: string[],
  draft: DraftState,
  initialTier: Tier,
): UpdateTaskPatch {
  const patch: UpdateTaskPatch = {};
  if (draft.title !== initial.title) patch.title = draft.title;
  if (draft.body !== initial.body) {
    // Three-state encoding mirrors api.ts UpdateTaskPatch: passing null clears
    // the column. Empty body string means "no body" — encode as null.
    patch.body = draft.body.length > 0 ? draft.body : null;
  }
  if (draft.priority !== initial.priority) patch.priority = draft.priority;
  if (draft.assignee !== initial.assignee) {
    patch.assignee = draft.assignee.length > 0 ? draft.assignee : null;
  }
  if (draft.tier !== initialTier) patch.tier = draft.tier;
  const draftLabels = normalizeLabels(draft.labelsCsv);
  if (!arraysEqual(draftLabels, initialLabels)) patch.labels = draftLabels;
  return patch;
}

export function TaskEditModal({
  task,
  onClose,
  onSubmit,
}: TaskEditModalProps) {
  const initialTier: Tier = (task.tier as Tier | undefined) ?? "med";
  const initial: DraftState = {
    title: task.title,
    body: task.body ?? "",
    priority: task.priority,
    assignee: task.assignee ?? "",
    tier: initialTier,
    labelsCsv: task.labels.join(", "),
  };
  const initialLabels = task.labels;

  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [priority, setPriority] = useState(initial.priority);
  const [assignee, setAssignee] = useState(initial.assignee);
  const [tier, setTier] = useState<Tier>(initialTier);
  const [labelsCsv, setLabelsCsv] = useState(initial.labelsCsv);
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
  const draft: DraftState = {
    title: trimmedTitle,
    body: trimmedBody,
    priority,
    assignee: trimmedAssignee,
    tier,
    labelsCsv,
  };
  const patch = buildPatch(initial, initialLabels, draft, initialTier);
  const hasChanges = Object.keys(patch).length > 0;
  const canSubmit = trimmedTitle.length > 0 && hasChanges && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(task.id, patch);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to update task");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit task"
      data-testid="task-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Edit task
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="task-edit-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p
            data-testid="task-edit-id"
            className="font-mono text-label-sm text-subtle"
          >
            {task.ticket_number ?? task.id}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Title <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="task-edit-title"
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
              data-testid="task-edit-body"
              rows={8}
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
                data-testid="task-edit-priority"
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
                Tier
              </span>
              <select
                data-testid="task-edit-tier"
                value={tier}
                onChange={(e) => setTier(e.target.value as Tier)}
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground",
                  "focus:border-primary focus:outline-none",
                )}
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Assignee
            </span>
            <input
              type="text"
              data-testid="task-edit-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Leave empty to unassign"
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Labels
            </span>
            <input
              type="text"
              data-testid="task-edit-labels"
              value={labelsCsv}
              onChange={(e) => setLabelsCsv(e.target.value)}
              placeholder="Comma-separated, e.g. ui, refactor"
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
              data-testid="task-edit-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="task-edit-cancel"
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
            data-testid="task-edit-submit"
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
