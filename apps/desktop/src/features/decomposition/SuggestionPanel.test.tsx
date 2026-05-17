import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuggestionPanel from "./SuggestionPanel";
import type {
  DecompositionResult,
  DecompositionSuggestion,
} from "../../data/types";

function makeSuggestion(
  over: Partial<DecompositionSuggestion> = {},
): DecompositionSuggestion {
  return {
    idx: 0,
    title: "Sub A",
    rationale: "Because A",
    scope_hint: "src/a",
    inherited_envelope_keys: [],
    ...over,
  };
}

function makeResult(
  over: Partial<DecompositionResult> = {},
): DecompositionResult {
  return {
    parent: { id: "TASK-1", ticket_number: "LM-1", title: "Parent" },
    strategy: "auto",
    max_depth: 2,
    existing_children_count: 0,
    suggested_subtasks: [],
    policy_violations: [],
    ...over,
  };
}

describe("SuggestionPanel (LM-87)", () => {
  it("shows loading state then renders suggestions", async () => {
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [
          makeSuggestion({ idx: 0, title: "First" }),
          makeSuggestion({ idx: 1, title: "Second" }),
        ],
      }),
    );
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    expect(screen.getByTestId("suggestion-panel-loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(onDecompose).toHaveBeenCalledWith("TASK-1", {
      strategy: "auto",
      max_depth: 2,
    });
  });

  it("surfaces fetch errors via an alert region", async () => {
    const onDecompose = vi.fn(async () => {
      throw new Error("daemon down");
    });
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel-error")).toHaveTextContent(
        "daemon down",
      ),
    );
  });

  it("renders policy violations with severity-coded styling", async () => {
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [makeSuggestion()],
        policy_violations: [
          {
            field: "success_criteria",
            severity: "error",
            message: "missing",
          },
          {
            field: "atomic_size_hint",
            severity: "warning",
            message: "too large",
          },
        ],
      }),
    );
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("suggestion-panel-violations"),
      ).toBeInTheDocument(),
    );
    const errorRow = screen.getByText(/missing/);
    const warningRow = screen.getByText(/too large/);
    expect(errorRow.closest("li")).toHaveAttribute("data-severity", "error");
    expect(warningRow.closest("li")).toHaveAttribute(
      "data-severity",
      "warning",
    );
  });

  it("toggles selection on checkbox click and enables Accept", async () => {
    const user = userEvent.setup();
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [makeSuggestion({ idx: 0, title: "Pick me" })],
      }),
    );
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    const accept = screen.getByTestId("suggestion-panel-accept");
    expect(accept).toBeDisabled();
    expect(accept).toHaveTextContent("Accept 0 selected");
    await user.click(screen.getByLabelText("Select Pick me"));
    expect(accept).not.toBeDisabled();
    expect(accept).toHaveTextContent("Accept 1 selected");
  });

  it("reorders rows via up/down keyboard fallback", async () => {
    const user = userEvent.setup();
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [
          makeSuggestion({ idx: 0, title: "First" }),
          makeSuggestion({ idx: 1, title: "Second" }),
          makeSuggestion({ idx: 2, title: "Third" }),
        ],
      }),
    );
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    // Move "Third" up once (idx=2 → position 1).
    await user.click(screen.getByLabelText("Move Third up"));
    const rows = screen
      .getAllByRole("listitem")
      .filter((li) => li.hasAttribute("data-suggestion-key"));
    expect(rows[0]).toHaveAttribute("data-suggestion-key", "0");
    expect(rows[1]).toHaveAttribute("data-suggestion-key", "2");
    expect(rows[2]).toHaveAttribute("data-suggestion-key", "1");
  });

  it("disables Move-up on first row and Move-down on last row", async () => {
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [
          makeSuggestion({ idx: 0, title: "Head" }),
          makeSuggestion({ idx: 1, title: "Tail" }),
        ],
      }),
    );
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Move Head up")).toBeDisabled();
    expect(screen.getByLabelText("Move Tail down")).toBeDisabled();
    expect(screen.getByLabelText("Move Head down")).not.toBeDisabled();
    expect(screen.getByLabelText("Move Tail up")).not.toBeDisabled();
  });

  it("calls onCreateSubtask sequentially for each selected row and fires onAccepted", async () => {
    const user = userEvent.setup();
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [
          makeSuggestion({ idx: 0, title: "A", rationale: "rA" }),
          makeSuggestion({ idx: 1, title: "B", rationale: "rB" }),
          makeSuggestion({ idx: 2, title: "C", rationale: "rC" }),
        ],
      }),
    );
    const onCreateSubtask = vi.fn(async () => undefined);
    const onAccepted = vi.fn();
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={onCreateSubtask}
        onAccepted={onAccepted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText("Select A"));
    await user.click(screen.getByLabelText("Select C"));
    await user.click(screen.getByTestId("suggestion-panel-accept"));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(onCreateSubtask).toHaveBeenCalledTimes(2);
    expect(onCreateSubtask).toHaveBeenNthCalledWith(1, "TASK-1", {
      title: "A",
      body: "rA",
    });
    expect(onCreateSubtask).toHaveBeenNthCalledWith(2, "TASK-1", {
      title: "C",
      body: "rC",
    });
  });

  it("surfaces accept errors and does not fire onAccepted", async () => {
    const user = userEvent.setup();
    const onDecompose = vi.fn(async () =>
      makeResult({
        suggested_subtasks: [makeSuggestion({ idx: 0, title: "X" })],
      }),
    );
    const onCreateSubtask = vi.fn(async () => {
      throw new Error("create failed");
    });
    const onAccepted = vi.fn();
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={onCreateSubtask}
        onAccepted={onAccepted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel")).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText("Select X"));
    await user.click(screen.getByTestId("suggestion-panel-accept"));
    await waitFor(() =>
      expect(
        screen.getByTestId("suggestion-panel-accept-error"),
      ).toHaveTextContent("create failed"),
    );
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("renders empty state when daemon returns no suggestions", async () => {
    const onDecompose = vi.fn(async () => makeResult());
    render(
      <SuggestionPanel
        taskId="TASK-1"
        onDecompose={onDecompose}
        onCreateSubtask={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-panel-empty")).toBeInTheDocument(),
    );
  });
});
