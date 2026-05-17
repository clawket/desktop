import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CycleEditModal } from "./CycleEditModal";
import type { Cycle } from "../data/types";

const CYCLE: Cycle = {
  id: "CYC-1",
  project_id: "PROJ-1",
  unit_id: "UNIT-1",
  idx: 0,
  title: "Round 1",
  goal: "Original goal",
  created_at: "2026-01-01T00:00:00.000Z",
  started_at: null,
  ended_at: null,
  status: "planning",
};

describe("CycleEditModal", () => {
  it("pre-populates title and goal from the cycle", () => {
    render(
      <CycleEditModal
        cycle={CYCLE}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("cycle-edit-title")).toHaveValue("Round 1");
    expect(screen.getByTestId("cycle-edit-goal")).toHaveValue("Original goal");
    expect(screen.getByTestId("cycle-edit-id")).toHaveTextContent("CYC-1");
  });

  it("disables save when nothing changed (minimum-diff guard)", () => {
    render(
      <CycleEditModal
        cycle={CYCLE}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("cycle-edit-submit")).toBeDisabled();
  });

  it("sends only the changed title field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <CycleEditModal cycle={CYCLE} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("cycle-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Round 2");
    await user.click(screen.getByTestId("cycle-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("CYC-1", { title: "Round 2" });
  });

  it("encodes goal cleared to empty string as JSON null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <CycleEditModal cycle={CYCLE} onClose={() => {}} onSubmit={onSubmit} />,
    );
    await user.clear(screen.getByTestId("cycle-edit-goal"));
    await user.click(screen.getByTestId("cycle-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("CYC-1", { goal: null });
  });

  it("handles a cycle with null goal by treating empty as no change", () => {
    const cycleNoGoal: Cycle = { ...CYCLE, goal: null };
    render(
      <CycleEditModal
        cycle={cycleNoGoal}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("cycle-edit-goal")).toHaveValue("");
    expect(screen.getByTestId("cycle-edit-submit")).toBeDisabled();
  });

  it("disables save when title is cleared", async () => {
    const user = userEvent.setup();
    render(
      <CycleEditModal
        cycle={CYCLE}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    await user.clear(screen.getByTestId("cycle-edit-title"));
    expect(screen.getByTestId("cycle-edit-submit")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CycleEditModal
        cycle={CYCLE}
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
      throw new Error("FORBIDDEN: cycle is completed");
    });
    render(
      <CycleEditModal cycle={CYCLE} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("cycle-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "x");
    await user.click(screen.getByTestId("cycle-edit-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("cycle-edit-error")).toHaveTextContent(
        "FORBIDDEN: cycle is completed",
      ),
    );
  });

  it("sends both title and goal when both changed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <CycleEditModal cycle={CYCLE} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("cycle-edit-title");
    const goalInput = screen.getByTestId("cycle-edit-goal");
    await user.clear(titleInput);
    await user.type(titleInput, "T2");
    await user.clear(goalInput);
    await user.type(goalInput, "G2");
    await user.click(screen.getByTestId("cycle-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("CYC-1", {
      title: "T2",
      goal: "G2",
    });
  });
});
