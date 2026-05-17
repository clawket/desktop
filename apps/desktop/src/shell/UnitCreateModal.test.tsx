import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitCreateModal } from "./UnitCreateModal";

describe("UnitCreateModal", () => {
  it("renders the dialog with empty fields", () => {
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("unit-create-modal")).toHaveAttribute(
      "role",
      "dialog",
    );
    expect(screen.getByTestId("unit-create-title")).toHaveValue("");
    expect(screen.getByTestId("unit-create-goal")).toHaveValue("");
  });

  it("submits with title only and omits empty goal", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("unit-create-title"), "U1");
    await user.click(screen.getByTestId("unit-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      planId: "PLAN-1",
      title: "U1",
    });
  });

  it("includes trimmed goal when provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("unit-create-title"), "U1");
    await user.type(screen.getByTestId("unit-create-goal"), "  goal text  ");
    await user.click(screen.getByTestId("unit-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      planId: "PLAN-1",
      title: "U1",
      goal: "goal text",
    });
  });

  it("disables submit when title is blank", () => {
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("unit-create-submit")).toBeDisabled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <UnitCreateModal
        planId="PLAN-1"
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
      <UnitCreateModal
        planId="PLAN-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("unit-create-title"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("unit-create-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via cancel button", () => {
    const onClose = vi.fn();
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("unit-create-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors and re-enables submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN: plan is completed");
    });
    render(
      <UnitCreateModal
        planId="PLAN-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("unit-create-title"), "X");
    await user.click(screen.getByTestId("unit-create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("unit-create-error")).toHaveTextContent(
        "FORBIDDEN: plan is completed",
      ),
    );
    expect(screen.getByTestId("unit-create-submit")).not.toBeDisabled();
  });
});
