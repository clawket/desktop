import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskEditModal } from "./TaskEditModal";
import type { Task } from "../data/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-1",
    unit_id: "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: "LM-100",
    idx: 0,
    title: "Original title",
    body: "Original body",
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
    labels: ["ui", "p1"],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    tier: "med",
    ...overrides,
  };
}

describe("TaskEditModal", () => {
  it("pre-populates fields from the task", () => {
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("task-edit-title")).toHaveValue("Original title");
    expect(screen.getByTestId("task-edit-body")).toHaveValue("Original body");
    expect(screen.getByTestId("task-edit-priority")).toHaveValue("med");
    expect(screen.getByTestId("task-edit-tier")).toHaveValue("med");
    expect(screen.getByTestId("task-edit-assignee")).toHaveValue("alice");
    expect(screen.getByTestId("task-edit-labels")).toHaveValue("ui, p1");
    expect(screen.getByTestId("task-edit-id")).toHaveTextContent("LM-100");
  });

  it("disables save when nothing changed (minimum-diff guard)", () => {
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("task-edit-submit")).toBeDisabled();
  });

  it("sends only the changed title field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const titleInput = screen.getByTestId("task-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed");
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", { title: "Renamed" });
  });

  it("encodes body cleared to empty as JSON null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.clear(screen.getByTestId("task-edit-body"));
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", { body: null });
  });

  it("encodes assignee cleared to empty as JSON null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.clear(screen.getByTestId("task-edit-assignee"));
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", { assignee: null });
  });

  it("parses labels CSV into a trimmed array", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const labelsInput = screen.getByTestId("task-edit-labels");
    await user.clear(labelsInput);
    await user.type(labelsInput, "ux ,  refactor, ");
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", {
      labels: ["ux", "refactor"],
    });
  });

  it("forwards priority + tier changes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.selectOptions(
      screen.getByTestId("task-edit-priority"),
      "critical",
    );
    await user.selectOptions(screen.getByTestId("task-edit-tier"), "high");
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("TASK-1", {
      priority: "critical",
      tier: "high",
    });
  });

  it("disables save when title is cleared", async () => {
    const user = userEvent.setup();
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    await user.clear(screen.getByTestId("task-edit-title"));
    expect(screen.getByTestId("task-edit-submit")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN: task is completed");
    });
    render(
      <TaskEditModal
        task={makeTask()}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const titleInput = screen.getByTestId("task-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "x");
    await user.click(screen.getByTestId("task-edit-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("task-edit-error")).toHaveTextContent(
        "FORBIDDEN: task is completed",
      ),
    );
  });
});
