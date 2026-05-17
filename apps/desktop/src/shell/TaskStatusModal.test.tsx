import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskStatusModal } from "./TaskStatusModal";
import type { Task } from "../data/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-1",
    unit_id: "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: "LM-100",
    idx: 0,
    title: "Do thing",
    body: "",
    priority: "med",
    complexity: null,
    estimated_edits: null,
    type: "task",
    reporter: null,
    assignee: null,
    agent_id: null,
    created_at: "2026-05-14T00:00:00.000Z",
    started_at: null,
    completed_at: null,
    status: "in_progress",
    depends_on: [],
    labels: [],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    tier: "med",
    ...overrides,
  };
}

describe("TaskStatusModal", () => {
  it("renders the ticket and current status", () => {
    render(
      <TaskStatusModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("task-status-ticket")).toHaveTextContent(
      "LM-100",
    );
  });

  it("offers in_progress → {blocked, done, cancelled} transitions", () => {
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("task-status-option-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("task-status-option-done")).toBeInTheDocument();
    expect(
      screen.getByTestId("task-status-option-cancelled"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("task-status-option-todo"),
    ).not.toBeInTheDocument();
  });

  it("shows terminal-state hint for done tasks (no transitions)", () => {
    render(
      <TaskStatusModal
        task={makeTask({ status: "done", evidence: "x" })}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(
      screen.getByTestId("task-status-no-transitions"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("task-status-submit")).toBeDisabled();
  });

  it("requires evidence when transitioning to done", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByTestId("task-status-option-done"));
    // Empty evidence → submit disabled.
    expect(screen.getByTestId("task-status-submit")).toBeDisabled();
    await user.type(
      screen.getByTestId("task-status-evidence"),
      "tests pass; PR #42",
    );
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", {
      status: "done",
      evidence: "tests pass; PR #42",
    });
  });

  it("rejects whitespace-only evidence for done", async () => {
    const user = userEvent.setup();
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    await user.click(screen.getByTestId("task-status-option-done"));
    await user.type(screen.getByTestId("task-status-evidence"), "   ");
    expect(screen.getByTestId("task-status-submit")).toBeDisabled();
  });

  it("forwards cancellation reason as the _comment sidecar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByTestId("task-status-option-cancelled"));
    await user.type(screen.getByTestId("task-status-reason"), "duplicate");
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", {
      status: "cancelled",
      comment: "duplicate",
    });
  });

  it("omits comment when cancellation reason is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByTestId("task-status-option-cancelled"));
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", { status: "cancelled" });
  });

  it("forwards comment sidecar for non-terminal transitions", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    // Pick blocked, attach a comment.
    await user.click(screen.getByTestId("task-status-option-blocked"));
    await user.type(
      screen.getByTestId("task-status-comment"),
      "waiting on infra",
    );
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", {
      status: "blocked",
      comment: "waiting on infra",
    });
  });

  it("surfaces daemon EVIDENCE_REQUIRED errors and stays open", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("EVIDENCE_REQUIRED: missing evidence");
    });
    const onClose = vi.fn();
    render(
      <TaskStatusModal
        task={makeTask({ status: "in_progress" })}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByTestId("task-status-option-done"));
    await user.type(screen.getByTestId("task-status-evidence"), "shipped");
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("task-status-error")).toHaveTextContent(
        "EVIDENCE_REQUIRED: missing evidence",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <TaskStatusModal
        task={makeTask()}
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
