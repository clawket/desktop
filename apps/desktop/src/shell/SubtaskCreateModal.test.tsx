import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskCreateModal } from "./SubtaskCreateModal";
import type { Task } from "../data/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-P",
    unit_id: "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: "LM-100",
    idx: 0,
    title: "Parent",
    body: "",
    priority: "med",
    complexity: null,
    estimated_edits: null,
    type: "task",
    reporter: null,
    assignee: "alice",
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

describe("SubtaskCreateModal", () => {
  it("renders parent ticket and pre-fills priority/assignee from parent", () => {
    render(
      <SubtaskCreateModal
        parent={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("subtask-create-parent")).toHaveTextContent(
      "LM-100",
    );
    expect(screen.getByTestId("subtask-create-priority")).toHaveValue("med");
    expect(screen.getByTestId("subtask-create-assignee")).toHaveValue("alice");
  });

  it("disables submit when title is empty", () => {
    render(
      <SubtaskCreateModal
        parent={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("subtask-create-submit")).toBeDisabled();
  });

  it("submits title only when nothing else is changed and assignee matches parent", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <SubtaskCreateModal
        parent={makeTask({ assignee: "alice" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("subtask-create-title"), "Child task");
    // Assignee field is pre-filled with parent's "alice"; we forward it.
    await user.click(screen.getByTestId("subtask-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-P", {
      title: "Child task",
      assignee: "alice",
    });
  });

  it("omits assignee when the field is cleared", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <SubtaskCreateModal
        parent={makeTask({ assignee: "alice" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.clear(screen.getByTestId("subtask-create-assignee"));
    await user.type(screen.getByTestId("subtask-create-title"), "Child");
    await user.click(screen.getByTestId("subtask-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-P", { title: "Child" });
  });

  it("forwards body and priority overrides", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <SubtaskCreateModal
        parent={makeTask({ assignee: null, priority: "med" })}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("subtask-create-title"), "Child");
    await user.type(screen.getByTestId("subtask-create-body"), "Details");
    await user.selectOptions(
      screen.getByTestId("subtask-create-priority"),
      "high",
    );
    await user.click(screen.getByTestId("subtask-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-P", {
      title: "Child",
      body: "Details",
      priority: "high",
    });
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <SubtaskCreateModal
        parent={makeTask()}
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors and keeps modal open", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("UNIT_REQUIRED");
    });
    const onClose = vi.fn();
    render(
      <SubtaskCreateModal
        parent={makeTask()}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("subtask-create-title"), "x");
    await user.click(screen.getByTestId("subtask-create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("subtask-create-error")).toHaveTextContent(
        "UNIT_REQUIRED",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
