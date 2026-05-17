import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanEditModal } from "./PlanEditModal";
import type { Plan } from "../data/types";

const PLAN: Plan = {
  id: "PLAN-1",
  project_id: "PROJ-1",
  title: "Phase 10 rollout",
  description: "Original description",
  source: "manual",
  source_path: null,
  created_at: "2026-01-01T00:00:00.000Z",
  approved_at: null,
  status: "active",
};

describe("PlanEditModal", () => {
  it("pre-populates title and description from the plan", () => {
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={async () => {}} />,
    );
    expect(screen.getByTestId("plan-edit-title")).toHaveValue(
      "Phase 10 rollout",
    );
    expect(screen.getByTestId("plan-edit-description")).toHaveValue(
      "Original description",
    );
    expect(screen.getByTestId("plan-edit-id")).toHaveTextContent("PLAN-1");
  });

  it("disables save when nothing changed (minimum-diff guard)", () => {
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={async () => {}} />,
    );
    expect(screen.getByTestId("plan-edit-submit")).toBeDisabled();
  });

  it("sends only the changed title field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("plan-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Renamed phase");
    await user.click(screen.getByTestId("plan-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("PLAN-1", { title: "Renamed phase" });
  });

  it("encodes description cleared to empty string as JSON null", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={onSubmit} />,
    );
    await user.clear(screen.getByTestId("plan-edit-description"));
    await user.click(screen.getByTestId("plan-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("PLAN-1", { description: null });
  });

  it("handles a plan with null description by treating empty as no change", () => {
    const planNoDesc: Plan = { ...PLAN, description: null };
    render(
      <PlanEditModal
        plan={planNoDesc}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("plan-edit-description")).toHaveValue("");
    expect(screen.getByTestId("plan-edit-submit")).toBeDisabled();
  });

  it("disables save when title is cleared", async () => {
    const user = userEvent.setup();
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={async () => {}} />,
    );
    await user.clear(screen.getByTestId("plan-edit-title"));
    expect(screen.getByTestId("plan-edit-submit")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <PlanEditModal plan={PLAN} onClose={onClose} onSubmit={async () => {}} />,
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
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("plan-edit-title");
    await user.clear(titleInput);
    await user.type(titleInput, "x");
    await user.click(screen.getByTestId("plan-edit-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-edit-error")).toHaveTextContent(
        "FORBIDDEN: plan is completed",
      ),
    );
  });

  it("sends both title and description when both changed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanEditModal plan={PLAN} onClose={() => {}} onSubmit={onSubmit} />,
    );
    const titleInput = screen.getByTestId("plan-edit-title");
    const descInput = screen.getByTestId("plan-edit-description");
    await user.clear(titleInput);
    await user.type(titleInput, "T2");
    await user.clear(descInput);
    await user.type(descInput, "D2");
    await user.click(screen.getByTestId("plan-edit-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("PLAN-1", {
      title: "T2",
      description: "D2",
    });
  });
});
