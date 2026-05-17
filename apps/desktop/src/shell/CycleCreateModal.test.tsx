import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CycleCreateModal } from "./CycleCreateModal";

describe("CycleCreateModal", () => {
  it("renders the dialog with empty fields and shows the unit id", () => {
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("cycle-create-modal")).toHaveAttribute(
      "role",
      "dialog",
    );
    expect(screen.getByTestId("cycle-create-title")).toHaveValue("");
    expect(screen.getByTestId("cycle-create-goal")).toHaveValue("");
    expect(screen.getByTestId("cycle-create-unit")).toHaveTextContent("UNIT-1");
  });

  it("submits with title only and omits empty goal (PDD A4 unit_id required)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("cycle-create-title"), "Round 1");
    await user.click(screen.getByTestId("cycle-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      unitId: "UNIT-1",
      title: "Round 1",
    });
  });

  it("includes trimmed goal when provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("cycle-create-title"), "Round 1");
    await user.type(
      screen.getByTestId("cycle-create-goal"),
      "  Converge defects  ",
    );
    await user.click(screen.getByTestId("cycle-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      unitId: "UNIT-1",
      title: "Round 1",
      goal: "Converge defects",
    });
  });

  it("disables submit when title is blank", () => {
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("cycle-create-submit")).toBeDisabled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not when clicking inside", () => {
    const onClose = vi.fn();
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("cycle-create-title"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("cycle-create-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via cancel button", () => {
    const onClose = vi.fn();
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("cycle-create-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors and re-enables submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("MISSING_UNIT_ID: unit_id required");
    });
    render(
      <CycleCreateModal
        projectId="PROJ-1"
        unitId="UNIT-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("cycle-create-title"), "X");
    await user.click(screen.getByTestId("cycle-create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("cycle-create-error")).toHaveTextContent(
        "MISSING_UNIT_ID: unit_id required",
      ),
    );
    expect(screen.getByTestId("cycle-create-submit")).not.toBeDisabled();
  });
});
