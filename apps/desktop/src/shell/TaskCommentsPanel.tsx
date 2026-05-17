// TaskCommentsPanel — inline list/create/delete for a single task's comments.
//
// Wire facts:
//   - GET /tasks/:id/comments returns TaskComment[] sorted ascending by
//     created_at (daemon repo::comments::list). We render in that order.
//   - POST /tasks/:id/comments accepts { author, body }. We default author to
//     DEFAULT_COMMENT_AUTHOR ("main") to mirror the CLI.
//   - DELETE /comments/:id is soft: the row stays but `body` becomes
//     "[DELETED] <original>" (or just "[DELETED]"). We refetch after delete so
//     the soft marker shows up; we also strip the marker visually and gray the
//     row out.
//   - The daemon does NOT currently emit an SSE event for comment lifecycle
//     beyond the default fold into timeline, so this panel owns its refetch
//     cycle. Mutations always trigger a re-pull.

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, cn } from "@clawket/ui";
import {
  COMMENT_SOFT_DELETED_PREFIX,
  DEFAULT_COMMENT_AUTHOR,
} from "../data/api";
import type { TaskComment } from "../data/types";

export interface TaskCommentsPanelProps {
  taskId: string;
  /** Read the current list. Called on mount + after each mutation. */
  onList: (taskId: string) => Promise<TaskComment[]>;
  /** Create a comment. */
  onCreate?: (
    taskId: string,
    input: { body: string; author?: string },
  ) => Promise<TaskComment>;
  /** Soft-delete a comment by id. */
  onDelete?: (id: string) => Promise<void>;
  /** Author shown as the byline for new entries. Defaults to "main". */
  defaultAuthor?: string;
}

interface RenderedComment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: string;
  /** True when body starts with the daemon's soft-delete marker. */
  isDeleted: boolean;
}

function decorate(comment: TaskComment): RenderedComment {
  const isDeleted = comment.body.startsWith(COMMENT_SOFT_DELETED_PREFIX);
  const body = isDeleted
    ? comment.body.slice(COMMENT_SOFT_DELETED_PREFIX.length).trimStart()
    : comment.body;
  return { ...comment, body, isDeleted };
}

function formatTimestamp(iso: string): string {
  // Daemon emits ISO 8601 UTC strings. Display in local time, short form.
  // Failed parses fall back to the raw string so the row still renders.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function TaskCommentsPanel({
  taskId,
  onList,
  onCreate,
  onDelete,
  defaultAuthor = DEFAULT_COMMENT_AUTHOR,
}: TaskCommentsPanelProps) {
  const [comments, setComments] = useState<RenderedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refetch = useCallback(async () => {
    setErr(null);
    try {
      const list = await onList(taskId);
      setComments(list.map(decorate));
    } catch (e) {
      setErr((e as Error).message || "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [onList, taskId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !submitting && !!onCreate;

  async function handleCreate() {
    if (!canSubmit || !onCreate) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onCreate(taskId, { body: trimmed, author: defaultAuthor });
      setDraft("");
      await refetch();
    } catch (e) {
      setErr((e as Error).message || "Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!onDelete) return;
    const ok = window.confirm("Delete this comment?");
    if (!ok) return;
    setErr(null);
    try {
      await onDelete(id);
      await refetch();
    } catch (e) {
      setErr((e as Error).message || "Failed to delete comment");
    }
  }

  return (
    <div
      data-testid="task-detail-comments"
      className="flex flex-col gap-3"
    >
      {err && (
        <p
          role="alert"
          data-testid="task-detail-comments-error"
          className="text-body-sm text-error"
        >
          {err}
        </p>
      )}
      {loading ? (
        <p
          data-testid="task-detail-comments-loading"
          className="text-body-sm text-subtle"
        >
          Loading comments…
        </p>
      ) : comments.length === 0 ? (
        <p
          data-testid="task-detail-comments-empty"
          className="text-body-sm text-subtle"
        >
          No comments yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li
              key={c.id}
              data-testid={`task-detail-comment-${c.id}`}
              data-deleted={c.isDeleted || undefined}
              className={cn(
                "rounded-md border border-border bg-surface-high p-3",
                c.isDeleted && "opacity-60",
              )}
            >
              <header className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-label-sm font-semibold text-foreground">
                    {c.author}
                  </span>
                  {c.isDeleted && (
                    <Badge variant="neutral" size="sm">
                      deleted
                    </Badge>
                  )}
                  <span className="text-label-sm text-subtle">
                    {formatTimestamp(c.created_at)}
                  </span>
                </div>
                {onDelete && !c.isDeleted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`task-detail-comment-delete-${c.id}`}
                    onClick={() => {
                      void handleDelete(c.id);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </header>
              <p className="whitespace-pre-line text-body-sm text-foreground">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {onCreate && (
        <div className="flex flex-col gap-2">
          <textarea
            data-testid="task-detail-comment-draft"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className={cn(
              "rounded-md border border-border bg-background px-3 py-2",
              "text-body-sm text-foreground placeholder:text-muted",
              "focus:border-primary focus:outline-none",
            )}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              data-testid="task-detail-comment-submit"
              onClick={() => {
                void handleCreate();
              }}
              disabled={!canSubmit}
            >
              {submitting ? "Posting…" : "Post comment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
