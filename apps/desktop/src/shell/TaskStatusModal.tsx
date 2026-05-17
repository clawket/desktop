import { useEffect, useMemo, useState } from "react";
import { cn, StatusPill, type TaskStatus } from "@clawket/ui";
import type { UpdateTaskPatch } from "../data/api";
import type { Task } from "../data/types";

export interface TaskStatusModalProps {
  task: Task;
  onClose: () => void;
  /**
   * Resolves on success; rejects with the daemon error so the modal can
   * surface `EVIDENCE_REQUIRED` and stay open for retry.
   */
  onSubmit: (id: string, patch: UpdateTaskPatch) => Promise<unknown>;
}

/**
 * Lifecycle transitions allowed from each starting status (mirrors the
 * daemon's `repo::tasks::validate_transition`). `done` and `cancelled` are
 * terminal — once a task reaches them, no further status change is offered
 * from this modal. Re-opening cancelled work is intentionally out of scope.
 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  done: [],
  cancelled: [],
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

function buildPatch(
  next: TaskStatus,
  evidence: string,
  reason: string,
  comment: string,
): UpdateTaskPatch {
  const patch: UpdateTaskPatch = { status: next };
  if (next === "done") {
    // Daemon's EVIDENCE_REQUIRED check rejects empty / whitespace.
    patch.evidence = evidence;
  } else if (next === "cancelled") {
    // Cancellation uses the sidecar `_comment` for the audit trail; daemon
    // appends it to the task's comment thread server-side.
    if (reason.length > 0) patch.comment = reason;
  } else if (comment.length > 0) {
    patch.comment = comment;
  }
  return patch;
}

export function TaskStatusModal({
  task,
  onClose,
  onSubmit,
}: TaskStatusModalProps) {
  const allowed = TRANSITIONS[task.status];
  const [next, setNext] = useState<TaskStatus | "">(() => allowed[0] ?? "");
  const [evidence, setEvidence] = useState(task.evidence ?? "");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmedEvidence = evidence.trim();
  const trimmedReason = reason.trim();
  const trimmedComment = comment.trim();
  const evidenceMissing = next === "done" && trimmedEvidence.length === 0;
  const canSubmit = useMemo(
    () => next !== "" && !evidenceMissing && !submitting,
    [next, evidenceMissing, submitting],
  );

  async function handleSubmit() {
    if (!canSubmit || next === "") return;
    setSubmitting(true);
    setErr(null);
    try {
      const patch = buildPatch(
        next,
        trimmedEvidence,
        trimmedReason,
        trimmedComment,
      );
      await onSubmit(task.id, patch);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to update task status");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change task status"
      data-testid="task-status-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            Change status
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="task-status-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center gap-3 text-body-sm">
            <span
              className="font-mono text-label-sm text-subtle"
              data-testid="task-status-ticket"
            >
              {task.ticket_number ?? task.id}
            </span>
            <StatusPill status={task.status} size="sm" />
            <span className="text-muted">→</span>
            {next === "" ? (
              <span
                className="text-subtle italic"
                data-testid="task-status-no-transitions"
              >
                No transitions available
              </span>
            ) : (
              <StatusPill status={next} size="sm" />
            )}
          </div>
          {allowed.length === 0 ? (
            <p className="text-body-sm text-subtle">
              This task is in a terminal state ({STATUS_LABELS[task.status]});
              create a follow-up task if more work is needed.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                New status
              </span>
              <div
                role="radiogroup"
                aria-label="New status"
                className="flex flex-wrap gap-2"
              >
                {allowed.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={next === s}
                    data-testid={`task-status-option-${s}`}
                    onClick={() => setNext(s)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-body-sm",
                      "transition-colors",
                      next === s
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-surface text-muted hover:border-primary/60 hover:text-foreground",
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {next === "done" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Evidence <span className="text-error">*</span>
              </span>
              <textarea
                data-testid="task-status-evidence"
                rows={5}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="What confirms this task is done? (test output, PR link, screenshot path, …)"
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground placeholder:text-muted",
                  "focus:border-primary focus:outline-none",
                )}
              />
              <span className="text-label-sm text-subtle">
                The daemon rejects status=done without evidence
                (EVIDENCE_REQUIRED).
              </span>
            </label>
          )}
          {next === "cancelled" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Reason
              </span>
              <textarea
                data-testid="task-status-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this task being cancelled? (optional, recorded as a comment)"
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground placeholder:text-muted",
                  "focus:border-primary focus:outline-none",
                )}
              />
            </label>
          )}
          {next !== "" && next !== "done" && next !== "cancelled" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm uppercase tracking-wide text-muted">
                Comment
              </span>
              <textarea
                data-testid="task-status-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional note attached as a comment."
                className={cn(
                  "rounded-md border border-border bg-background px-3 py-2",
                  "text-body-sm text-foreground placeholder:text-muted",
                  "focus:border-primary focus:outline-none",
                )}
              />
            </label>
          )}
          {err && (
            <p
              role="alert"
              data-testid="task-status-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="task-status-cancel"
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
            data-testid="task-status-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5",
              "text-body-sm font-semibold text-primary-foreground",
              "hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submitting ? "Saving…" : "Update status"}
          </button>
        </footer>
      </div>
    </div>
  );
}
