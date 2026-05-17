import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanCreateModal } from "./PlanCreateModal";

describe("PlanCreateModal", () => {
  it("renders the dialog with empty fields", () => {
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("plan-create-modal")).toHaveAttribute(
      "role",
      "dialog",
    );
    expect(screen.getByTestId("plan-create-title")).toHaveValue("");
    expect(screen.getByTestId("plan-create-description")).toHaveValue("");
  });

  it("submits with title only and omits empty description", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("plan-create-title"), "Roadmap");
    await user.click(screen.getByTestId("plan-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      title: "Roadmap",
      source: "manual",
    });
  });

  it("includes trimmed description when provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("plan-create-title"), "Roadmap");
    await user.type(
      screen.getByTestId("plan-create-description"),
      "  Goals  ",
    );
    await user.click(screen.getByTestId("plan-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      title: "Roadmap",
      source: "manual",
      description: "Goals",
    });
  });

  it("selects plan-mode source and includes it in payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("plan-create-title"), "Imported plan");
    await user.selectOptions(
      screen.getByTestId("plan-create-source"),
      "plan-mode",
    );
    await user.click(screen.getByTestId("plan-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      title: "Imported plan",
      source: "plan-mode",
    });
  });

  it("selects import source and includes it in payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("plan-create-title"), "From file");
    await user.selectOptions(
      screen.getByTestId("plan-create-source"),
      "import",
    );
    await user.click(screen.getByTestId("plan-create-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      title: "From file",
      source: "import",
    });
  });

  it("disables submit when title is blank", () => {
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByTestId("plan-create-submit")).toBeDisabled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <PlanCreateModal
        projectId="PROJ-1"
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
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    // Click inside content (title field) — should NOT close
    fireEvent.click(screen.getByTestId("plan-create-title"));
    expect(onClose).not.toHaveBeenCalled();
    // Click the backdrop
    fireEvent.click(screen.getByTestId("plan-create-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via cancel button", () => {
    const onClose = vi.fn();
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={onClose}
        onSubmit={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("plan-create-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces daemon errors and re-enables submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("DUPLICATE_TITLE: already taken");
    });
    render(
      <PlanCreateModal
        projectId="PROJ-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByTestId("plan-create-title"), "Dup");
    await user.click(screen.getByTestId("plan-create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-create-error")).toHaveTextContent(
        "DUPLICATE_TITLE: already taken",
      ),
    );
    expect(screen.getByTestId("plan-create-submit")).not.toBeDisabled();
  });
});
