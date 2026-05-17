import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskQuestionsPanel } from "./TaskQuestionsPanel";
import type { Question } from "../data/types";

function makeQuestion(over: Partial<Question> = {}): Question {
  return {
    id: "Q-1",
    plan_id: null,
    unit_id: null,
    task_id: "TASK-1",
    kind: "clarification",
    origin: "prompt",
    body: "Why?",
    asked_by: "main",
    created_at: "2026-05-14T10:00:00.000Z",
    answer: null,
    answered_by: null,
    answered_at: null,
    ...over,
  };
}

describe("TaskQuestionsPanel", () => {
  it("renders loading then list, calling onList with the taskId", async () => {
    const onList = vi.fn(async () => [makeQuestion()]);
    render(<TaskQuestionsPanel taskId="TASK-1" onList={onList} />);
    expect(
      screen.getByTestId("task-detail-questions-loading"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-question-Q-1"),
      ).toBeInTheDocument(),
    );
    expect(onList).toHaveBeenCalledWith("TASK-1");
  });

  it("renders empty state when no questions", async () => {
    render(
      <TaskQuestionsPanel
        taskId="TASK-1"
        onList={async () => []}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-questions-empty"),
      ).toBeInTheDocument(),
    );
  });

  it("shows open status for unanswered questions and answered for resolved ones", async () => {
    render(
      <TaskQuestionsPanel
        taskId="TASK-1"
        onList={async () => [
          makeQuestion(),
          makeQuestion({
            id: "Q-2",
            answer: "yes",
            answered_by: "alice",
            answered_at: "2026-05-14T11:00:00.000Z",
          }),
        ]}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-question-Q-2"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("task-detail-question-status-Q-1"),
    ).toHaveTextContent("open");
    expect(
      screen.getByTestId("task-detail-question-status-Q-2"),
    ).toHaveTextContent("answered");
    expect(
      screen.getByTestId("task-detail-question-answer-Q-2"),
    ).toHaveTextContent("yes");
  });

  it("calls onCreate with body + selected kind, defaulting kind to clarification", async () => {
    const user = userEvent.setup();
    const onList = vi
      .fn<() => Promise<Question[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeQuestion({ body: "blocker?" })]);
    const onCreate = vi.fn(async () =>
      makeQuestion({ body: "blocker?", kind: "blocker" }),
    );
    render(
      <TaskQuestionsPanel
        taskId="TASK-1"
        onList={onList}
        onCreate={onCreate}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-questions-empty"),
      ).toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByTestId("task-detail-question-kind"),
      "blocker",
    );
    await user.type(
      screen.getByTestId("task-detail-question-body"),
      "blocker?",
    );
    await user.click(screen.getByTestId("task-detail-question-create"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      taskId: "TASK-1",
      body: "blocker?",
      kind: "blocker",
      askedBy: "main",
    });
    await waitFor(() => expect(onList).toHaveBeenCalledTimes(2));
  });

  it("answers an open question and refetches", async () => {
    const user = userEvent.setup();
    const open = makeQuestion();
    const answered = makeQuestion({
      answer: "because",
      answered_by: "main",
      answered_at: "2026-05-14T11:00:00.000Z",
    });
    const onList = vi
      .fn<() => Promise<Question[]>>()
      .mockResolvedValueOnce([open])
      .mockResolvedValue([answered]);
    const onAnswer = vi.fn(async () => answered);

    render(
      <TaskQuestionsPanel
        taskId="TASK-1"
        onList={onList}
        onAnswer={onAnswer}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-question-draft-Q-1"),
      ).toBeInTheDocument(),
    );

    await user.type(
      screen.getByTestId("task-detail-question-draft-Q-1"),
      "because",
    );
    await user.click(screen.getByTestId("task-detail-question-submit-Q-1"));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    expect(onAnswer).toHaveBeenCalledWith("Q-1", {
      answer: "because",
      answeredBy: "main",
    });
    await waitFor(() => expect(onList).toHaveBeenCalledTimes(2));
  });

  it("surfaces fetch errors via the error region", async () => {
    const onList = vi.fn(async () => {
      throw new Error("nope");
    });
    render(<TaskQuestionsPanel taskId="TASK-1" onList={onList} />);
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-questions-error"),
      ).toHaveTextContent("nope"),
    );
  });
});
