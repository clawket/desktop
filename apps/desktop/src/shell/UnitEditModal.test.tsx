import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitEditModal } from "./UnitEditModal";
import type { Unit } from "../data/types";

const UNIT: Unit = {
  id: "UNIT-1",
  plan_id: "PLAN-1",
  idx: 0,
  title: "Original title",
  goal: "Original goal",
  execution_mode: "claude",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("UnitEditModal", () => {
  it("pre-populates title and goal from the unit", () => {
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={async () => {}} />,
    );
    expect(screen.getByTestId("unit-edit-title")).toHaveValue("Original title");
    expect(screen.getByTestId("unit-edit-goal")).toHaveValue("Original goal");
    expect(screen.getByTestId("unit-edit-id")).toHaveTextContent("UNIT-1");
  });

  it("disables save when nothing changed (minimum-diff guard)", () => {
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={async () => {}} />,
    );
    expect(screen.getByTestId("unit-edit-submit")).toBeDisabled();
  });

  it("sends only the changed title field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("unit-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed unit");
    await user.click(screen.getByTestId("unit-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("UNIT-1", { title: "Renamed unit" });
  });

  it("encodes goal cleared to empty string as JSON null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={onSubmit} />,
    );
    await user.clear(screen.getByTestId("unit-edit-goal"));
    await user.click(screen.getByTestId("unit-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("UNIT-1", { goal: null });
  });

  it("handles a unit with null goal by treating empty as no change", () => {
    const unitNoGoal: Unit = { ...UNIT, goal: null };
    render(
      <UnitEditModal
        unit={unitNoGoal}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("unit-edit-goal")).toHaveValue("");
    expect(screen.getByTestId("unit-edit-submit")).toBeDisabled();
  });

  it("disables save when title is cleared", async () => {
    const user = userEvent.setup();
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={async () => {}} />,
    );
    await user.clear(screen.getByTestId("unit-edit-title"));
    expect(screen.getByTestId("unit-edit-submit")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <UnitEditModal unit={UNIT} onClose={onClose} onSubmit={async () => {}} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN: plan is completed");
    });
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("unit-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "x");
    await user.click(screen.getByTestId("unit-edit-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("unit-edit-error")).toHaveTextContent(
        "FORBIDDEN: plan is completed",
      ),
    );
  });

  it("sends both title and goal when both changed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <UnitEditModal unit={UNIT} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("unit-edit-title");
    const goalInput = screen.getByTestId("unit-edit-goal");
    await user.clear(titleInput);
    await user.type(titleInput, "T2");
    await user.clear(goalInput);
    await user.type(goalInput, "G2");
    await user.click(screen.getByTestId("unit-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("UNIT-1", {
      title: "T2",
      goal: "G2",
    });
  });
});
