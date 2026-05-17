import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskCommentsPanel } from "./TaskCommentsPanel";
import type { TaskComment } from "../data/types";

function makeComment(over: Partial<TaskComment> = {}): TaskComment {
  return {
    id: "CMT-1",
    task_id: "TASK-1",
    author: "main",
    body: "Hello",
    created_at: "2026-05-14T10:00:00.000Z",
    ...over,
  };
}

describe("TaskCommentsPanel", () => {
  it("shows loading then renders the comment list", async () => {
    const onList = vi.fn(async () => [makeComment()]);
    render(
      <TaskCommentsPanel taskId="TASK-1" onList={onList} />,
    );
    expect(
      screen.getByTestId("task-detail-comments-loading"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-comment-CMT-1")).toBeInTheDocument(),
    );
    expect(onList).toHaveBeenCalledWith("TASK-1");
  });

  it("renders empty state when no comments", async () => {
    render(
      <TaskCommentsPanel taskId="TASK-1" onList={async () => []} />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-comments-empty"),
      ).toBeInTheDocument(),
    );
  });

  it("surfaces fetch errors via the error region", async () => {
    const onList = vi.fn(async () => {
      throw new Error("boom");
    });
    render(<TaskCommentsPanel taskId="TASK-1" onList={onList} />);
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-comments-error"),
      ).toHaveTextContent("boom"),
    );
  });

  it("calls onCreate with default author and refetches", async () => {
    const user = userEvent.setup();
    const onList = vi
      .fn<() => Promise<TaskComment[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeComment({ body: "new one" })]);
    const onCreate = vi.fn(async () => makeComment({ body: "new one" }));

    render(
      <TaskCommentsPanel
        taskId="TASK-1"
        onList={onList}
        onCreate={onCreate}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-comments-empty"),
      ).toBeInTheDocument(),
    );

    await user.type(
      screen.getByTestId("task-detail-comment-draft"),
      "new one",
    );
    await user.click(screen.getByTestId("task-detail-comment-submit"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith("TASK-1", {
      body: "new one",
      author: "main",
    });
    await waitFor(() => expect(onList).toHaveBeenCalledTimes(2));
  });

  it("decorates soft-deleted comments and hides delete button", async () => {
    const deleted = makeComment({
      id: "CMT-2",
      body: "[DELETED] old text",
    });
    render(
      <TaskCommentsPanel
        taskId="TASK-1"
        onList={async () => [deleted]}
        onDelete={async () => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-comment-CMT-2")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("task-detail-comment-delete-CMT-2"),
    ).toBeNull();
  });

  it("invokes onDelete then refetches", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    try {
      const onList = vi
        .fn<() => Promise<TaskComment[]>>()
        .mockResolvedValueOnce([makeComment()])
        .mockResolvedValue([]);
      const onDelete = vi.fn(async () => {});
      render(
        <TaskCommentsPanel
          taskId="TASK-1"
          onList={onList}
          onDelete={onDelete}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("task-detail-comment-delete-CMT-1"),
        ).toBeInTheDocument(),
      );
      await user.click(
        screen.getByTestId("task-detail-comment-delete-CMT-1"),
      );
      await waitFor(() => expect(onDelete).toHaveBeenCalledWith("CMT-1"));
      await waitFor(() => expect(onList).toHaveBeenCalledTimes(2));
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("aborts delete when confirm() returns false", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    try {
      const onDelete = vi.fn(async () => {});
      render(
        <TaskCommentsPanel
          taskId="TASK-1"
          onList={async () => [makeComment()]}
          onDelete={onDelete}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("task-detail-comment-delete-CMT-1"),
        ).toBeInTheDocument(),
      );
      await user.click(
        screen.getByTestId("task-detail-comment-delete-CMT-1"),
      );
      expect(onDelete).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
