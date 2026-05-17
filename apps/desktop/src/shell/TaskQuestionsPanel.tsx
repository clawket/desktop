// TaskQuestionsPanel — inline list/create/answer for a single task's questions.
//
// Wire facts:
//   - GET /questions?task_id=:id returns Question[] (daemon repo::questions).
//   - POST /questions with `task_id` creates a question; `kind` defaults to
//     "clarification" and `origin` defaults to "prompt" server-side.
//   - POST /questions/:id/answer with `{ answer, answered_by? }` resolves it.
//   - Answered questions are surfaced read-only with their answer block; open
//     questions expose an answer form.

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, cn } from "@clawket/ui";
import {
  DEFAULT_COMMENT_AUTHOR,
  DEFAULT_QUESTION_ASKED_BY,
  type CreateQuestionInput,
  type AnswerQuestionInput,
} from "../data/api";
import type { Question } from "../data/types";

const KIND_OPTIONS = ["clarification", "decision", "blocker"] as const;

export interface TaskQuestionsPanelProps {
  taskId: string;
  onList: (taskId: string) => Promise<Question[]>;
  onCreate?: (input: CreateQuestionInput) => Promise<Question>;
  onAnswer?: (id: string, input: AnswerQuestionInput) => Promise<Question>;
  defaultAskedBy?: string;
  defaultAnsweredBy?: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function kindVariant(kind: string): "success" | "warning" | "neutral" {
  if (kind === "blocker") return "warning";
  if (kind === "decision") return "success";
  return "neutral";
}

interface QuestionItemProps {
  q: Question;
  onAnswer?: (id: string, input: AnswerQuestionInput) => Promise<unknown>;
  defaultAnsweredBy: string;
}

function QuestionItem({ q, onAnswer, defaultAnsweredBy }: QuestionItemProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = !q.answer;

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !submitting && open && !!onAnswer;

  async function handleAnswer() {
    if (!canSubmit || !onAnswer) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onAnswer(q.id, {
        answer: trimmed,
        answeredBy: defaultAnsweredBy,
      });
      setDraft("");
    } catch (e) {
      setErr((e as Error).message || "Failed to answer");
      setSubmitting(false);
    }
  }

  return (
    <li
      data-testid={`task-detail-question-${q.id}`}
      data-open={open || undefined}
      className={cn(
        "rounded-md border border-border bg-surface-high p-3",
        "flex flex-col gap-2",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={kindVariant(q.kind)} size="sm">
            {q.kind}
          </Badge>
          <span className="text-label-sm text-subtle">
            {q.asked_by ?? "unknown"} · {formatTimestamp(q.created_at)}
          </span>
        </div>
        <span
          className="text-label-sm uppercase tracking-wide text-muted"
          data-testid={`task-detail-question-status-${q.id}`}
        >
          {open ? "open" : "answered"}
        </span>
      </header>
      <p className="whitespace-pre-line text-body-sm text-foreground">
        {q.body}
      </p>
      {q.answer && (
        <div
          data-testid={`task-detail-question-answer-${q.id}`}
          className="rounded-md border border-border bg-background p-2"
        >
          <p className="text-label-sm text-subtle">
            {q.answered_by ?? "unknown"}
            {q.answered_at ? ` · ${formatTimestamp(q.answered_at)}` : ""}
          </p>
          <p className="whitespace-pre-line text-body-sm text-foreground">
            {q.answer}
          </p>
        </div>
      )}
      {open && onAnswer && (
        <div className="flex flex-col gap-2">
          <textarea
            data-testid={`task-detail-question-draft-${q.id}`}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Answer…"
            className={cn(
              "rounded-md border border-border bg-background px-3 py-2",
              "text-body-sm text-foreground placeholder:text-muted",
              "focus:border-primary focus:outline-none",
            )}
          />
          {err && (
            <p
              role="alert"
              data-testid={`task-detail-question-error-${q.id}`}
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              data-testid={`task-detail-question-submit-${q.id}`}
              onClick={() => {
                void handleAnswer();
              }}
              disabled={!canSubmit}
            >
              {submitting ? "Answering…" : "Submit answer"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function TaskQuestionsPanel({
  taskId,
  onList,
  onCreate,
  onAnswer,
  defaultAskedBy = DEFAULT_QUESTION_ASKED_BY,
  defaultAnsweredBy = DEFAULT_COMMENT_AUTHOR,
}: TaskQuestionsPanelProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftKind, setDraftKind] = useState<string>("clarification");
  const [submitting, setSubmitting] = useState(false);

  const refetch = useCallback(async () => {
    setErr(null);
    try {
      const list = await onList(taskId);
      setQuestions(list);
    } catch (e) {
      setErr((e as Error).message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [onList, taskId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  const trimmed = draftBody.trim();
  const canSubmit = trimmed.length > 0 && !submitting && !!onCreate;

  async function handleCreate() {
    if (!canSubmit || !onCreate) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onCreate({
        taskId,
        body: trimmed,
        kind: draftKind,
        askedBy: defaultAskedBy,
      });
      setDraftBody("");
      setDraftKind("clarification");
      await refetch();
    } catch (e) {
      setErr((e as Error).message || "Failed to ask question");
    } finally {
      setSubmitting(false);
    }
  }

  // Wrap onAnswer so we refetch after success — but only if a refresh is
  // actually needed (the answer mutates server state). The QuestionItem
  // component triggers this directly via its prop.
  const handleAnswerWithRefetch = useCallback(
    async (id: string, input: AnswerQuestionInput) => {
      if (!onAnswer) return undefined;
      const updated = await onAnswer(id, input);
      await refetch();
      return updated;
    },
    [onAnswer, refetch],
  );

  return (
    <div
      data-testid="task-detail-questions"
      className="flex flex-col gap-3"
    >
      {err && (
        <p
          role="alert"
          data-testid="task-detail-questions-error"
          className="text-body-sm text-error"
        >
          {err}
        </p>
      )}
      {loading ? (
        <p
          data-testid="task-detail-questions-loading"
          className="text-body-sm text-subtle"
        >
          Loading questions…
        </p>
      ) : questions.length === 0 ? (
        <p
          data-testid="task-detail-questions-empty"
          className="text-body-sm text-subtle"
        >
          No open questions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((q) => (
            <QuestionItem
              key={q.id}
              q={q}
              onAnswer={onAnswer ? handleAnswerWithRefetch : undefined}
              defaultAnsweredBy={defaultAnsweredBy}
            />
          ))}
        </ul>
      )}
      {onCreate && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-label-sm uppercase tracking-wide text-muted">
              Kind
            </label>
            <select
              data-testid="task-detail-question-kind"
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value)}
              className={cn(
                "rounded-md border border-border bg-background px-2 py-1",
                "text-body-sm text-foreground",
                "focus:border-primary focus:outline-none",
              )}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <textarea
            data-testid="task-detail-question-body"
            rows={3}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Ask a question…"
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
              data-testid="task-detail-question-create"
              onClick={() => {
                void handleCreate();
              }}
              disabled={!canSubmit}
            >
              {submitting ? "Asking…" : "Ask"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
